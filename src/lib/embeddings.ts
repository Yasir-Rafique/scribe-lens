// src/lib/embeddings.ts
import crypto from "crypto";
import OpenAI from "openai";
import { mkdir, writeFile, rename } from "fs/promises";
import path from "path";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const VECTOR_DIR = path.resolve("./vector");
const STATUS_DIR = path.join(VECTOR_DIR, "status");

export type Chunk = { id?: string; text: string };

export async function processEmbeddings(
  pdfId: string,
  chunks: Chunk[],
  batchSize = 64
) {
  await mkdir(VECTOR_DIR, { recursive: true });
  await mkdir(STATUS_DIR, { recursive: true });

  const outPath = path.join(VECTOR_DIR, `${pdfId}.json`);
  const statusPath = path.join(STATUS_DIR, `${pdfId}.json`);

  // Initialize status
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
    console.warn("Failed to write initial status:", e);
  }

  const vectors: Array<{ id: string; text: string; embedding: number[] }> = [];

  // Process in batches
  for (let i = 0; i < chunks.length; i += batchSize) {
    const batch = chunks.slice(i, i + batchSize);
    const inputs = batch.map((c) => c.text);

    const resp = await openai.embeddings.create({
      model: "text-embedding-3-small",
      input: inputs,
    });

    for (let j = 0; j < resp.data.length; j++) {
      vectors.push({
        id: batch[j].id ?? crypto.randomUUID(),
        text: batch[j].text,
        embedding: resp.data[j].embedding,
      });
    }

    // Update status
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
      console.warn("Failed to update status file:", e);
    }

    // Write partial vectors
    try {
      const tmpOut = outPath + ".tmp";
      await writeFile(tmpOut, JSON.stringify(vectors, null, 2), "utf-8");
      await rename(tmpOut, outPath);
    } catch (e) {
      console.warn("Failed to write partial vectors:", e);
    }
  }

  // Final status
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
    console.warn("Failed to write final status:", e);
  }

  return vectors.length;
}
