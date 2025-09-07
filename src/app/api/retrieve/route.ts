// src/app/api/retrieve/route.ts
import { NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import OpenAI from "openai";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const VECTOR_DIR = path.join(process.cwd(), "vector");

// Safe cosine similarity (returns 0 on mismatch)
function cosineSimilarity(vecA: number[], vecB: number[]): number {
  if (
    !Array.isArray(vecA) ||
    !Array.isArray(vecB) ||
    vecA.length !== vecB.length
  )
    return 0;
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < vecA.length; i++) {
    dot += vecA[i] * vecB[i];
    normA += vecA[i] * vecA[i];
    normB += vecB[i] * vecB[i];
  }
  if (normA === 0 || normB === 0) return 0;
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const query: string = body?.query ?? body?.question;
    const pdfId: string | undefined = body?.pdfId;
    const topK: number = Number(body?.topK ?? 3);

    if (!query || typeof query !== "string") {
      return NextResponse.json(
        { success: false, error: "Query (or question) is required" },
        { status: 400 }
      );
    }
    if (!pdfId || typeof pdfId !== "string") {
      return NextResponse.json(
        { success: false, error: "pdfId is required" },
        { status: 400 }
      );
    }

    const filePath = path.join(VECTOR_DIR, `${pdfId}.json`);
    if (!fs.existsSync(filePath)) {
      return NextResponse.json(
        { success: false, error: `No vectors found for pdfId=${pdfId}` },
        { status: 404 }
      );
    }

    // 1) Embed the query
    const embeddingResp = await openai.embeddings.create({
      model: "text-embedding-3-small",
      input: query,
    });
    const queryEmbedding = embeddingResp.data?.[0]?.embedding;
    if (!Array.isArray(queryEmbedding)) {
      return NextResponse.json(
        { success: false, error: "Failed to create query embedding" },
        { status: 500 }
      );
    }

    // 2) Load vectors for this PDF
    const raw = fs.readFileSync(filePath, "utf-8");
    const vectorData = JSON.parse(raw) as any[];

    // 3) Score each vector (support both `embedding` and `embeddings` field names)
    const scored = vectorData
      .map((item: any) => {
        const vec: any =
          item.embedding ?? item.embeddings ?? item.vector ?? null;
        if (!Array.isArray(vec)) return null;
        const score = cosineSimilarity(queryEmbedding, vec);
        return {
          id: item.id ?? null,
          text: item.text ?? "",
          score,
        };
      })
      .filter(Boolean) as { id: string | null; text: string; score: number }[];

    // 4) Sort + return topK
    const results = scored.sort((a, b) => b.score - a.score).slice(0, topK);

    return NextResponse.json({ success: true, results });
  } catch (err: any) {
    console.error("Retrieve error:", err);
    return NextResponse.json(
      { success: false, error: err?.message ?? String(err) },
      { status: 500 }
    );
  }
}
