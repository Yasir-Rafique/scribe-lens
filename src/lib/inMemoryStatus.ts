// src/lib/inMemoryStatus.ts
export type EmbeddingStatus = {
  pdfId: string;
  total: number;
  processed: number;
  status: "processing" | "done" | "error";
  error?: string | null;
};

export const statusMap = new Map<string, EmbeddingStatus>();

export function initStatus(pdfId: string, total: number) {
  statusMap.set(pdfId, { pdfId, total, processed: 0, status: "processing" });
}

export function updateStatus(pdfId: string, processed: number) {
  const s = statusMap.get(pdfId);
  if (s) {
    s.processed = processed;
    statusMap.set(pdfId, s);
  }
}

export function markDone(pdfId: string) {
  const s = statusMap.get(pdfId);
  if (s) {
    s.status = "done";
    statusMap.set(pdfId, s);
  }
}

export function markError(pdfId: string, err: string) {
  statusMap.set(pdfId, {
    pdfId,
    total: 0,
    processed: 0,
    status: "error",
    error: err,
  });
}

export function getStatus(pdfId: string): EmbeddingStatus | null {
  return statusMap.get(pdfId) ?? null;
}
