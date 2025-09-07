// src/app/api/summarize/route.ts
import { NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import OpenAI from "openai";

// Define the shape of a single vector entry
interface VectorItem {
  text: string;
}

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const VECTOR_DIR = path.join(process.cwd(), "vector");

function safeSnippet(text: string, len = 800) {
  if (!text) return "";
  return text.replace(/\s+/g, " ").trim().slice(0, len);
}

function loadVectorsForPdf(pdfId: string): VectorItem[] | null {
  const filePath = path.join(VECTOR_DIR, `${pdfId}.json`);
  if (!fs.existsSync(filePath)) return null;
  const raw = fs.readFileSync(filePath, "utf-8");
  return JSON.parse(raw) as VectorItem[];
}

export async function POST(req: Request) {
  try {
    const { pdfId } = await req.json();
    if (!pdfId)
      return NextResponse.json(
        { success: false, error: "pdfId required" },
        { status: 400 }
      );

    const vectors = loadVectorsForPdf(pdfId);
    if (!vectors || vectors.length === 0) {
      return NextResponse.json(
        { success: false, error: `No vectors found for pdfId=${pdfId}` },
        { status: 404 }
      );
    }

    // choose up to N chunks (conservative)
    const N = 30;
    const chosen = vectors
      .slice(0, N)
      .map((v: VectorItem) => safeSnippet(v.text, 1000))
      .join("\n\n");

    const systemPrompt = `You are a concise summarizer. Use only the supplied context to produce a short, factual summary of the document. Provide 5 clear bullet points, each 1-2 short sentences. Do not invent facts. If the context is insufficient, say you cannot summarize fully.`;

    const userPrompt = `Context:\n${chosen}\n\nPlease provide a 5-bullet concise summary of the document.`;

    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      max_tokens: 600,
    });

    const summary =
      completion.choices?.[0]?.message?.content ?? "No summary generated.";

    return NextResponse.json({ success: true, summary });
  } catch (err: unknown) {
    console.error("Error in /api/summarize:", err);
    return NextResponse.json(
      {
        success: false,
        error: err instanceof Error ? err.message : String(err),
      },
      { status: 500 }
    );
  }
}
