// src/lib/inMemoryVectorStore.ts
import fs from "fs";
import path from "path";
import crypto from "crypto";

export type VectorEntry = {
  id: string;
  text: string;
  embedding: number[];
  meta?: Record<string, any>;
};

export type EmbeddingStatus = {
  pdfId: string;
  total: number;
  processed: number;
  status: "processing" | "done" | "error";
  error?: string | null;
};

const GLOBAL_KEY = "__SCRIBE_LENS_VSTORE__";

const globalAny: any = globalThis as any;
if (!globalAny[GLOBAL_KEY]) {
  globalAny[GLOBAL_KEY] = {
    vectors: new Map<string, VectorEntry[]>(),
    status: new Map<string, EmbeddingStatus>(),
    meta: new Map<string, Record<string, any>>(),
  };
}

const store: {
  vectors: Map<string, VectorEntry[]>;
  status: Map<string, EmbeddingStatus>;
  meta: Map<string, Record<string, any>>;
} = globalAny[GLOBAL_KEY];

const PERSIST_TO_DISK = Boolean(process.env.IN_MEMORY_PERSIST);
const BACKUP_DIR = path.resolve("./vector/backup");
if (PERSIST_TO_DISK) {
  try {
    fs.mkdirSync(BACKUP_DIR, { recursive: true });
  } catch {}
}

function safeWriteBackup(pdfId: string) {
  if (!PERSIST_TO_DISK) return;
  try {
    const out = {
      vectors: store.vectors.get(pdfId) ?? [],
      status: store.status.get(pdfId) ?? null,
      meta: store.meta.get(pdfId) ?? null,
    };
    fs.writeFileSync(
      path.join(BACKUP_DIR, `${pdfId}.json`),
      JSON.stringify(out, null, 2),
      "utf-8"
    );
  } catch (e) {
    console.warn("inMemoryStore: backup write failed", e);
  }
}

export const inMemoryVectorStore = {
  initStatus(pdfId: string, total: number, meta?: Record<string, any>) {
    const s: EmbeddingStatus = {
      pdfId,
      total,
      processed: 0,
      status: "processing",
      error: null,
    };
    store.status.set(pdfId, s);
    if (!store.vectors.has(pdfId)) store.vectors.set(pdfId, []);
    if (meta) store.meta.set(pdfId, meta);
    safeWriteBackup(pdfId);
  },

  addVectors(pdfId: string, entries: Array<Partial<VectorEntry>>) {
    if (!store.vectors.has(pdfId)) store.vectors.set(pdfId, []);
    const arr = store.vectors.get(pdfId)!;
    for (const e of entries) {
      const entry: VectorEntry = {
        id: e.id ?? crypto.randomUUID(),
        text: (e.text ?? "").toString(),
        embedding: (Array.isArray(e.embedding) ? e.embedding : []) as number[],
        meta: e.meta ?? undefined,
      };
      arr.push(entry);
    }
    safeWriteBackup(pdfId);
  },

  getVectors(pdfId: string): VectorEntry[] {
    const arr = store.vectors.get(pdfId);
    return arr ? arr.slice() : [];
  },

  count(pdfId: string): number {
    const arr = store.vectors.get(pdfId);
    return arr ? arr.length : 0;
  },

  // Status helpers
  updateStatus(
    pdfId: string,
    processed: number,
    status: EmbeddingStatus["status"],
    error: string | null = null,
    total?: number
  ) {
    const prev = store.status.get(pdfId);
    const s: EmbeddingStatus = {
      pdfId,
      total: typeof total === "number" ? total : prev?.total ?? 0,
      processed,
      status,
      error,
    };
    store.status.set(pdfId, s);
    safeWriteBackup(pdfId);
  },

  incrementProcessed(pdfId: string, by = 1) {
    const prev = store.status.get(pdfId);
    if (!prev) {
      const s: EmbeddingStatus = {
        pdfId,
        total: 0,
        processed: by,
        status: "processing",
        error: null,
      };
      store.status.set(pdfId, s);
      safeWriteBackup(pdfId);
      return;
    }
    const processed = prev.processed + by;
    const status: EmbeddingStatus = {
      pdfId,
      total: prev.total,
      processed,
      status: processed >= prev.total && prev.total > 0 ? "done" : "processing",
      error: null,
    };
    store.status.set(pdfId, status);
    safeWriteBackup(pdfId);
  },

  getStatus(pdfId: string): EmbeddingStatus | null {
    const s = store.status.get(pdfId);
    return s ? { ...s } : null;
  },

  setMeta(pdfId: string, meta: Record<string, any>) {
    store.meta.set(pdfId, meta);
    safeWriteBackup(pdfId);
  },

  mergeMeta(pdfId: string, partial: Record<string, any>) {
    const prev = store.meta.get(pdfId) ?? {};
    const merged = { ...prev, ...partial };
    store.meta.set(pdfId, merged);
    safeWriteBackup(pdfId);
  },

  getMeta(pdfId: string): Record<string, any> | null {
    const m = store.meta.get(pdfId);
    return m ? { ...m } : null;
  },

  deletePdf(pdfId: string) {
    store.vectors.delete(pdfId);
    store.status.delete(pdfId);
    store.meta.delete(pdfId);
    if (PERSIST_TO_DISK) {
      try {
        fs.unlinkSync(path.join(BACKUP_DIR, `${pdfId}.json`));
      } catch {}
    }
  },

  listPdfIds(): string[] {
    return Array.from(store.vectors.keys());
  },

  // Load from previously persisted backup (best-effort)
  loadFromBackup(pdfId: string) {
    if (!PERSIST_TO_DISK) return;
    try {
      const raw = fs.readFileSync(
        path.join(BACKUP_DIR, `${pdfId}.json`),
        "utf-8"
      );
      const j = JSON.parse(raw);
      if (Array.isArray(j.vectors)) store.vectors.set(pdfId, j.vectors);
      if (j.status) store.status.set(pdfId, j.status);
      if (j.meta) store.meta.set(pdfId, j.meta);
    } catch (e) {}
  },

  // debug helper - returns a brief summary of stored pdfs + counts + meta keys
  _dumpAll() {
    return {
      pdfIds: this.listPdfIds(),
      counts: Array.from(store.vectors.entries()).map(([k, v]) => ({
        pdfId: k,
        count: v.length,
      })),
      metaSummary: Array.from(store.meta.entries()).map(([k, m]) => ({
        pdfId: k,
        metaKeys: Object.keys(m ?? {}),
      })),
      statuses: Array.from(store.status.entries()).map(([k, s]) => s),
    };
  },
};
