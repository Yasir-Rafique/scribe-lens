// src/app/api/ask/route.ts
import { NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import OpenAI from "openai";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const VECTOR_DIR = path.join(process.cwd(), "vector");

// cosine similarity helper
function cosineSimilarity(a: number[], b: number[]): number {
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

function safeSnippet(t: string, len = 800) {
  if (!t) return "";
  return t.replace(/\s+/g, " ").trim().slice(0, len);
}

function loadVectorsForPdf(pdfId: string) {
  const filePath = path.join(VECTOR_DIR, `${pdfId}.json`);
  if (!fs.existsSync(filePath)) return null;
  const raw = fs.readFileSync(filePath, "utf-8");
  return JSON.parse(raw) as any[];
}

function loadMetaForPdf(pdfId: string) {
  try {
    const metaPath = path.join(VECTOR_DIR, `${pdfId}.meta.json`);
    if (!fs.existsSync(metaPath)) return null;
    const raw = fs.readFileSync(metaPath, "utf-8");
    return JSON.parse(raw);
  } catch (e) {
    return null;
  }
}

function politeFallbackText() {
  return "I couldn't find that information in the uploaded document. Could you try rephrasing your question or check a different document?";
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const query: string = (body?.query ?? body?.question)?.toString?.() ?? "";
    const retrievalQuery: string =
      (body?.retrievalQuery?.toString && body?.retrievalQuery.toString()) ??
      query;
    const pdfId: string | undefined = body?.pdfId;
    const topK: number = Math.max(1, Number(body?.topK ?? 8));
    const summaryHint: string | undefined =
      body?.summaryHint && typeof body.summaryHint === "string"
        ? body.summaryHint
        : undefined;

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

    // Attempt to load metadata quickly
    const meta = loadMetaForPdf(pdfId);

    // Quick metadata-first answers for common doc-level questions
    //const qLower = query.toLowerCase();

    // Author queries
    if (
      meta &&
      meta.author &&
      /\b(author|who wrote|written by|who is the author|author name|writer)\b/i.test(
        query
      )
    ) {
      return NextResponse.json({
        success: true,
        answer: meta.author,
        context: [{ text: `Author: ${meta.author}`, score: 1 }],
      });
    }

    // Title queries
    if (
      meta &&
      meta.title &&
      /\b(title|what is the title|book title)\b/i.test(query)
    ) {
      return NextResponse.json({
        success: true,
        answer: meta.title,
        context: [{ text: `Title: ${meta.title}`, score: 1 }],
      });
    }

    // TOC / Chapters listing
    if (
      meta &&
      Array.isArray(meta.toc) &&
      meta.toc.length > 0 &&
      /\b(chapter|chapters|table of contents|contents|list chapters)\b/i.test(
        query
      )
    ) {
      const tocText = meta.toc.join("\n");
      return NextResponse.json({
        success: true,
        answer: `Chapters / TOC (extracted):\n${tocText}`,
        context: [{ text: tocText, score: 1 }],
      });
    }

    // Try to load vectors for retrieval; if absent, we will call LLM without doc context
    const vectors = loadVectorsForPdf(pdfId);

    // Will hold the final chosen scored chunks
    let contextEntries: { text: string; score: number }[] = [];

    if (vectors && vectors.length > 0) {
      // 1) Primary retrieval using retrievalQuery
      try {
        const embResp = await openai.embeddings.create({
          model: "text-embedding-3-small",
          input: retrievalQuery,
        });
        const qVec = embResp.data?.[0]?.embedding;
        if (Array.isArray(qVec)) {
          const scored = vectors
            .map((item: any) => {
              const vec =
                item.embedding ?? item.embeddings ?? item.vector ?? null;
              if (!Array.isArray(vec)) return null;
              return {
                text: item.text ?? "",
                score: cosineSimilarity(qVec, vec),
              };
            })
            .filter(Boolean) as { text: string; score: number }[];

          scored.sort((a, b) => b.score - a.score);
          contextEntries = scored.slice(0, Math.min(topK, scored.length));
        }
      } catch (e) {
        console.warn("Primary retrieval (retrievalQuery) failed:", e);
      }

      // 2) Back-off: if no good hits, try original query embedding
      const topScore = contextEntries[0]?.score ?? 0;
      if (
        (contextEntries.length === 0 || topScore < 0.55) &&
        retrievalQuery !== query
      ) {
        try {
          const embResp2 = await openai.embeddings.create({
            model: "text-embedding-3-small",
            input: query,
          });
          const qVec2 = embResp2.data?.[0]?.embedding;
          if (Array.isArray(qVec2)) {
            const scored2 = vectors
              .map((item: any) => {
                const vec =
                  item.embedding ?? item.embeddings ?? item.vector ?? null;
                if (!Array.isArray(vec)) return null;
                return {
                  text: item.text ?? "",
                  score: cosineSimilarity(qVec2, vec),
                };
              })
              .filter(Boolean) as { text: string; score: number }[];
            scored2.sort((a, b) => b.score - a.score);
            const top2 = scored2.slice(0, Math.min(topK, scored2.length));

            // merge results, preferring higher score, and dedupe by text
            const merged: Record<string, { text: string; score: number }> = {};
            [...contextEntries, ...top2].forEach((c) => {
              const key = c.text.slice(0, 200);
              const existing = merged[key];
              if (!existing || c.score > existing.score) {
                merged[key] = c;
              }
            });
            contextEntries = Object.values(merged)
              .sort((a, b) => b.score - a.score)
              .slice(0, Math.min(topK, Object.keys(merged).length));
          }
        } catch (e) {
          console.warn("Backoff retrieval (original query) failed:", e);
        }
      }

      // 3) Keyword fallback (lightweight) if still empty
      if (contextEntries.length === 0) {
        const tokens = Array.from(
          new Set((query.toLowerCase().match(/\b\w{4,}\b/g) ?? []).slice(0, 12))
        );
        if (tokens.length > 0) {
          const hits: { text: string; score: number }[] = [];
          for (const item of vectors) {
            const txt = (item.text ?? "").toString().toLowerCase();
            let count = 0;
            for (const t of tokens) {
              if (txt.includes(t)) count++;
            }
            if (count > 0) {
              hits.push({ text: item.text ?? "", score: count });
            }
          }
          hits.sort((a, b) => b.score - a.score);
          contextEntries = hits.slice(0, Math.min(topK, hits.length));
        }
      }
    }

    // Build contextText from chosen entries + optional summaryHint prepended
    let contextText = "";
    if (summaryHint && typeof summaryHint === "string") {
      contextText = `Document Summary:\n${safeSnippet(summaryHint, 1200)}\n\n`;
    }
    if (contextEntries && contextEntries.length > 0) {
      contextText += contextEntries
        .map((t) => safeSnippet(t.text, 1200))
        .join("\n\n");
    }

    // If no retrieval context but metadata exists, append metadata to help the LLM
    if ((!contextText || contextText.trim() === "") && meta) {
      const metaParts: string[] = [];
      if (meta.title) metaParts.push(`Title: ${meta.title}`);
      if (meta.author) metaParts.push(`Author: ${meta.author}`);
      if (Array.isArray(meta.toc) && meta.toc.length > 0) {
        metaParts.push(`TOC:\n${meta.toc.slice(0, 50).join("\n")}`);
      }
      if (metaParts.length > 0) {
        contextText = `Document metadata:\n${metaParts.join("\n")}\n\n`;
      }
    }

    // Build system prompt asking for polite fallback when the answer is not in context
    const systemPrompt = contextText
      ? `You are a helpful assistant. Answer the user's question using ONLY the provided context. If the answer is not contained in the context, respond politely: "${politeFallbackText()}". Keep the response concise and factual.`
      : `You are a helpful assistant. There is no document context available. Answer the user's question as best as you can, and if you are unsure, say: "${politeFallbackText()}"`;

    const userPrompt = contextText
      ? `Context:\n${contextText}\n\nQuestion: ${query}`
      : `Question: ${query}`;

    // ask the LLM
    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      max_tokens: 600,
    });

    let answer =
      completion.choices?.[0]?.message?.content ?? "No answer generated.";

    // Normalize fallbacks: replace blunt "I don't know" with polite fallback
    const lower = (answer || "").toLowerCase();
    const dontKnowPatterns = [
      "i don't know",
      "i do not know",
      "i'm not sure",
      "sorry, i don't know",
      "i cannot find",
    ];
    const isUnhelpful = dontKnowPatterns.some((p) => lower.includes(p));
    if (isUnhelpful) {
      answer = politeFallbackText();
    }

    // return answer and the selected context snippets (with scores when available)
    const contextOut =
      contextEntries && contextEntries.length > 0
        ? contextEntries.map((c) => ({ text: c.text, score: c.score }))
        : [];

    return NextResponse.json({ success: true, answer, context: contextOut });
  } catch (err: any) {
    console.error("Error in /api/ask:", err);
    return NextResponse.json(
      { success: false, error: err?.message ?? String(err) },
      { status: 500 }
    );
  }
}
