// src/app/api/embeddings/route.ts
import { NextResponse } from "next/server";
import { mkdir, writeFile, rename } from "fs/promises";
import path from "path";
import crypto from "crypto";
import OpenAI from "openai";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const VECTOR_DIR = path.resolve("./vector");
const STATUS_DIR = path.join(VECTOR_DIR, "status");

type Chunk = { id?: string; text: string };

export async function POST(req: Request) {
  try {
    const { chunks, pdfId: incomingPdfId, batchSize = 64 } = await req.json();

    if (!Array.isArray(chunks) || chunks.length === 0) {
      return NextResponse.json(
        { success: false, error: "No chunks provided" },
        { status: 400 }
      );
    }

    await mkdir(VECTOR_DIR, { recursive: true });
    await mkdir(STATUS_DIR, { recursive: true });

    const pdfId = incomingPdfId ?? crypto.randomUUID();
    const outPath = path.join(VECTOR_DIR, `${pdfId}.json`);
    const statusPath = path.join(STATUS_DIR, `${pdfId}.json`);

    // initialize status
    const total = chunks.length;
    const initialStatus = {
      pdfId,
      total,
      processed: 0,
      status: "processing",
      error: null,
    };
    try {
      const tmpInit = statusPath + ".tmp";
      await writeFile(tmpInit, JSON.stringify(initialStatus, null, 2), "utf-8");
      await rename(tmpInit, statusPath);
    } catch (e) {
      console.warn("Failed to write initial status (non-fatal):", e);
    }

    const vectors: Array<{ id: string; text: string; embedding: number[] }> =
      [];

    // process in batches
    for (let i = 0; i < chunks.length; i += batchSize) {
      const batch = chunks.slice(i, i + batchSize) as Chunk[];
      const inputs = batch.map((c) =>
        typeof c.text === "string" ? c.text : ""
      );

      // call embeddings for an array of texts (batch)
      const resp = await openai.embeddings.create({
        model: "text-embedding-3-small",
        input: inputs,
      });

      // resp.data is array of embeddings corresponding to inputs
      for (let j = 0; j < resp.data.length; j++) {
        const emb = resp.data[j].embedding;
        const chunkObj = batch[j];
        vectors.push({
          id: chunkObj.id ?? crypto.randomUUID(),
          text: chunkObj.text,
          embedding: emb,
        });
      }

      // update status after each batch (atomic)
      const processed = Math.min(i + batch.length, total);
      const status = {
        pdfId,
        total,
        processed,
        status: processed >= total ? "done" : "processing",
        error: null,
      };
      try {
        const tmpStatus = statusPath + ".tmp";
        await writeFile(tmpStatus, JSON.stringify(status, null, 2), "utf-8");
        await rename(tmpStatus, statusPath);
      } catch (e) {
        console.warn("Failed to update status file (non-fatal):", e);
      }

      // write partial vectors file so it's readable during processing (atomic)
      try {
        const tmpOut = outPath + ".tmp";
        await writeFile(tmpOut, JSON.stringify(vectors, null, 2), "utf-8");
        await rename(tmpOut, outPath);
      } catch (e) {
        console.warn("Failed to write partial vectors (non-fatal):", e);
      }
    }

    // final status (atomic)
    try {
      const finalStatus = {
        pdfId,
        total,
        processed: total,
        status: "done",
        error: null,
      };
      const tmpFinal = statusPath + ".tmp";
      await writeFile(tmpFinal, JSON.stringify(finalStatus, null, 2), "utf-8");
      await rename(tmpFinal, statusPath);
    } catch (e) {
      console.warn("Failed to write final status (non-fatal):", e);
    }

    return NextResponse.json({ success: true, pdfId, count: vectors.length });
  } catch (err: any) {
    console.error("Embeddings error:", err);
    // if pdfId known, write error into status file (best-effort)
    try {
      const pdfId = (err?.pdfId as string) ?? null;
      if (pdfId) {
        const statusPath = path.join(VECTOR_DIR, "status", `${pdfId}.json`);
        const tmpErr = statusPath + ".tmp";
        await writeFile(
          tmpErr,
          JSON.stringify(
            {
              pdfId,
              total: 0,
              processed: 0,
              status: "error",
              error: String(err?.message ?? err),
            },
            null,
            2
          ),
          "utf-8"
        );
        await rename(tmpErr, statusPath);
      }
    } catch {}
    return NextResponse.json(
      { success: false, error: String(err?.message ?? err) },
      { status: 500 }
    );
  }
}
