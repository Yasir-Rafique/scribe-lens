// src/lib/embeddings.ts
import crypto from "crypto";
import OpenAI from "openai";
import { mkdir, writeFile, rename } from "fs/promises";
import path from "path";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const VECTOR_DIR = path.resolve("./vector");
const STATUS_DIR = path.join(VECTOR_DIR, "status");

export type Chunk = { id?: string; text: string };

function l2Normalize(vec: number[]) {
  const norm = Math.sqrt(vec.reduce((s, v) => s + v * v, 0)) || 1;
  return vec.map((v) => v / norm);
}

export async function processEmbeddings(
  pdfId: string,
  chunks: Chunk[],
  batchSize = 64,
  embeddingModel = "text-embedding-3-small"
) {
  await mkdir(VECTOR_DIR, { recursive: true });
  await mkdir(STATUS_DIR, { recursive: true });

  const outPath = path.join(VECTOR_DIR, `${pdfId}.json`);
  const statusPath = path.join(STATUS_DIR, `${pdfId}.json`);

  const total = chunks.length;
  const initialStatus = {
    pdfId,
    total,
    processed: 0,
    status: "processing",
    error: null,
  };

  try {
    await writeFile(
      statusPath + ".tmp",
      JSON.stringify(initialStatus, null, 2),
      "utf-8"
    );
    await rename(statusPath + ".tmp", statusPath);
  } catch (e) {
    console.warn("Failed to write initial status:", e);
  }

  const vectors: Array<{ id: string; text: string; embedding: number[] }> = [];

  for (let i = 0; i < chunks.length; i += batchSize) {
    const batch = chunks.slice(i, i + batchSize);
    const inputs = batch.map((c) => c.text);

    const resp = await openai.embeddings.create({
      model: embeddingModel,
      input: inputs,
    });

    const respData = Array.isArray(resp?.data) ? resp.data : [];
    for (let j = 0; j < respData.length; j++) {
      const emb = respData[j]?.embedding;
      if (!Array.isArray(emb)) {
        console.warn(`No embedding for item ${i + j}`);
        continue;
      }
      vectors.push({
        id: batch[j].id ?? crypto.randomUUID(),
        text: batch[j].text,
        embedding: l2Normalize(emb),
      });
    }

    const processed = Math.min(i + batch.length, total);
    const status = {
      pdfId,
      total,
      processed,
      status: processed >= total ? "done" : "processing",
      error: null,
    };
    try {
      await writeFile(
        statusPath + ".tmp",
        JSON.stringify(status, null, 2),
        "utf-8"
      );
      await rename(statusPath + ".tmp", statusPath);
    } catch (e) {
      console.warn("Failed to update status file:", e);
    }

    try {
      await writeFile(
        outPath + ".tmp",
        JSON.stringify(vectors, null, 2),
        "utf-8"
      );
      await rename(outPath + ".tmp", outPath);
    } catch (e) {
      console.warn("Failed to write partial vectors:", e);
    }
  }

  // final status
  try {
    const finalStatus = {
      pdfId,
      total,
      processed: total,
      status: "done",
      error: null,
    };
    await writeFile(
      statusPath + ".tmp",
      JSON.stringify(finalStatus, null, 2),
      "utf-8"
    );
    await rename(statusPath + ".tmp", statusPath);
  } catch (e) {
    console.warn("Failed to write final status:", e);
  }

  // ensure final vector file exists (atomic final attempt)
  try {
    await writeFile(
      outPath + ".tmp",
      JSON.stringify(vectors, null, 2),
      "utf-8"
    );
    await rename(outPath + ".tmp", outPath);
  } catch (e) {
    // non-fatal: file likely already exists
    // log for diagnostic
    console.warn("Final write of vectors failed (non-fatal):", e);
  }

  return vectors.length;
}
