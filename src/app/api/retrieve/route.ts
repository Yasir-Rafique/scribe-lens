// src/app/api/retrieve/route.ts
import { NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import OpenAI from "openai";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const VECTOR_DIR = path.resolve("./vector");

function cosineSimilarity(a: number[], b: number[]) {
  if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return 0;
  let dot = 0,
    na = 0,
    nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  if (na === 0 || nb === 0) return 0;
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

function safeSnippet(t: string, len = 300) {
  if (!t) return "";
  return t.replace(/\s+/g, " ").trim().slice(0, len);
}

function keywordScore(query: string, text: string) {
  if (!query || !text) return 0;
  const qTokens = Array.from(
    new Set((query.toLowerCase().match(/\b\w{4,}\b/g) ?? []).slice(0, 20))
  );
  if (qTokens.length === 0) return 0;
  const txt = text.toLowerCase();
  let count = 0;
  for (const t of qTokens) if (txt.includes(t)) count++;
  return count;
}

// Define types for vector entries
type VectorEntry = {
  id?: string | null;
  text?: string;
  embedding?: number[];
  embeddings?: number[];
  vector?: number[];
};

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const query: string =
      (body?.query ?? body?.question ?? "").toString?.() ?? "";
    const pdfId: string | undefined = body?.pdfId;
    const topK: number = Math.max(1, Number(body?.topK ?? 5));
    const debug: boolean = !!body?.debug;

    if (!query)
      return NextResponse.json(
        { success: false, error: "Query is required" },
        { status: 400 }
      );
    if (!pdfId)
      return NextResponse.json(
        { success: false, error: "pdfId is required" },
        { status: 400 }
      );

    const filePath = path.join(VECTOR_DIR, `${pdfId}.json`);
    if (!fs.existsSync(filePath))
      return NextResponse.json(
        { success: false, error: "No vectors found" },
        { status: 404 }
      );

    const raw = fs.readFileSync(filePath, "utf-8");
    const vectorData = JSON.parse(raw) as VectorEntry[];

    // 1) embed query
    const embResp = await openai.embeddings.create({
      model: "text-embedding-3-small",
      input: query,
    });
    const qVec = embResp.data?.[0]?.embedding;
    if (!Array.isArray(qVec))
      return NextResponse.json(
        { success: false, error: "Failed to create embedding" },
        { status: 500 }
      );
    const queryDim = qVec.length;

    // determine vectorDim
    let vectorDim = 0;
    for (const v of vectorData) {
      const vec = v.embedding ?? v.embeddings ?? v.vector ?? null;
      if (Array.isArray(vec)) {
        vectorDim = vec.length;
        break;
      }
    }

    const dimensionMismatch = vectorDim > 0 && vectorDim !== queryDim;

    // score
    const scored = vectorData
      .map((v) => {
        const vec = v.embedding ?? v.embeddings ?? v.vector ?? null;
        let score = 0;
        if (Array.isArray(vec) && !dimensionMismatch) {
          score = cosineSimilarity(qVec, vec);
        } else {
          score = keywordScore(query, v.text ?? "");
        }
        return { id: v.id ?? null, text: v.text ?? "", score };
      })
      .filter(Boolean);

    scored.sort((a, b) => b.score - a.score);
    const results = scored.slice(0, topK).map((r) => ({
      id: r.id,
      preview: safeSnippet(r.text, 400),
      score: r.score,
    }));

    const scoresOnly = scored.map((s) => s.score);
    const topScore = scoresOnly.length ? Math.max(...scoresOnly) : 0;
    const avgScore = scoresOnly.length
      ? scoresOnly.reduce((a, b) => a + b, 0) / scoresOnly.length
      : 0;

    const resp = {
      success: true,
      results,
      debug: {
        numVectors: vectorData.length,
        vectorDim,
        queryDim,
        dimensionMismatch,
        topScore,
        avgScore,
      },
    };
    if (debug) {
      (resp as Record<string, unknown>).sample = (vectorData ?? [])
        .slice(0, 6)
        .map((v) => {
          const emb = v.embedding ?? v.embeddings ?? v.vector ?? null;
          return {
            id: v.id ?? null,
            preview: safeSnippet(v.text ?? "", 300),
            hasEmbedding: Array.isArray(emb),
            embLength: Array.isArray(emb) ? emb.length : 0,
          };
        });
    }

    return NextResponse.json(resp);
  } catch (err: unknown) {
    console.error("Retrieve error:", err);
    return NextResponse.json(
      {
        success: false,
        error: err instanceof Error ? err.message : String(err),
      },
      { status: 500 }
    );
  }
}
