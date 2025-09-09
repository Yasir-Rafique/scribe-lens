// src/app/api/ask/route.ts
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

function safeSnippet(t: string, len = 800) {
  if (!t) return "";
  return t.replace(/\s+/g, " ").trim().slice(0, len);
}

function isNoisyText(t: string) {
  if (!t) return false;
  const noisy = [
    "researchgate",
    "see discussions",
    "view at",
    "downloaded from",
    "all rights reserved",
    "doi:",
    "doi.org",
    "©",
    "publisher",
  ];
  const lower = t.toLowerCase();
  return noisy.some((n) => lower.includes(n));
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

function isTitleQuery(q: string) {
  return /\b(title|what is the title|name of (the )?(paper|document)|please mention only the title)\b/i.test(
    q
  );
}
function isAuthorQuery(q: string) {
  return /\b(author|authors|who wrote|who are the authors|written by|byline)\b/i.test(
    q
  );
}
function isReferenceQuery(q: string) {
  return /\b(reference|references|bibliography|works cited|citations)\b/i.test(
    q
  );
}

// Create a short summary from sampled chunks using the LLM
async function synthesizeDocSummary(vectors: any[], maxCharsPerSnippet = 1200) {
  if (!Array.isArray(vectors) || vectors.length === 0) return "";
  const n = vectors.length;
  const samples = [];
  samples.push(safeSnippet(vectors[0]?.text ?? "", maxCharsPerSnippet));
  if (n > 4) {
    samples.push(
      safeSnippet(vectors[Math.floor(n / 3)]?.text ?? "", maxCharsPerSnippet)
    );
    samples.push(
      safeSnippet(
        vectors[Math.floor((2 * n) / 3)]?.text ?? "",
        maxCharsPerSnippet
      )
    );
  } else if (n > 1) {
    samples.push(
      safeSnippet(vectors[Math.min(1, n - 1)]?.text ?? "", maxCharsPerSnippet)
    );
  }
  if (n > 1)
    samples.push(safeSnippet(vectors[n - 1]?.text ?? "", maxCharsPerSnippet));

  const prompt = `You are given several short snippets from a single document. Produce a concise (3-5 sentence) neutral summary that captures the document's main topic and key points. Use only the text provided.\n\nSnippets:\n${samples.join(
    "\n\n---\n\n"
  )}\n\nSummary:`;

  try {
    const resp = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [{ role: "user", content: prompt }],
      max_tokens: 300,
    });
    const summary = resp.choices?.[0]?.message?.content ?? "";
    return (summary || "").toString().trim();
  } catch (e) {
    console.warn("Summary generation failed:", e);
    return "";
  }
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
        { success: false, error: `No vectors found for pdfId=${pdfId}` },
        { status: 404 }
      );

    const raw = fs.readFileSync(filePath, "utf-8");
    const vectorData = JSON.parse(raw) as any[]; // array of {id, text, embedding}

    // embed the retrievalQuery first (if different) else query
    let qEmbeddingResp;
    try {
      qEmbeddingResp = await openai.embeddings.create({
        model: "text-embedding-3-small",
        input: retrievalQuery,
      });
    } catch (e) {
      console.warn(
        "Primary embedding failed, falling back to query embedding:",
        e
      );
    }
    let qVec = qEmbeddingResp?.data?.[0]?.embedding;
    if (!Array.isArray(qVec)) {
      const emb2 = await openai.embeddings.create({
        model: "text-embedding-3-small",
        input: query,
      });
      qVec = emb2.data?.[0]?.embedding;
    }
    if (!Array.isArray(qVec)) {
      return NextResponse.json(
        { success: false, error: "Failed to create query embedding" },
        { status: 500 }
      );
    }

    // compute vectorDim and detect mismatch
    let vectorDim = 0;
    for (const v of vectorData) {
      const vec = v.embedding ?? v.embeddings ?? v.vector ?? null;
      if (Array.isArray(vec)) {
        vectorDim = vec.length;
        break;
      }
    }
    const queryDim = qVec.length;
    const dimensionMismatch = vectorDim > 0 && vectorDim !== queryDim;

    // score chunks
    const scored = (vectorData ?? [])
      .map((v, idx) => {
        const vec = v.embedding ?? v.embeddings ?? v.vector ?? null;
        let score = 0;
        if (Array.isArray(vec) && !dimensionMismatch) {
          score = cosineSimilarity(qVec, vec);
        } else {
          // fallback to keyword scoring when dims mismatch
          score = keywordScore(query, v.text ?? "");
        }
        // penalize direct junk/noisy/chrome/ResearchGate footers
        if (isNoisyText(v.text ?? "")) score -= 0.2;
        // boost front chunks for title/author queries
        if (isTitleQuery(query) && idx < 4) score += 0.45;
        if (isAuthorQuery(query) && idx < 6) score += 0.25;
        // small boost for snippets that contain "abstract" when user asks generic "what is this about"
        if (
          /\b(what is this about|summary|abstract|what is this document about)\b/i.test(
            query
          ) &&
          /abstract/i.test(v.text ?? "")
        )
          score += 0.2;
        return { idx, text: v.text ?? "", score, id: v.id ?? null };
      })
      .filter(Boolean)
      .sort((a, b) => b.score - a.score);

    const contextEntries = scored.slice(0, Math.min(topK, scored.length));

    // if top score is low, synthesize a short summary and prepend to context
    const topScore = contextEntries[0]?.score ?? 0;
    const LOW_SCORE_THRESHOLD = 0.32;
    let summaryText = "";
    if (topScore < LOW_SCORE_THRESHOLD) {
      summaryText = await synthesizeDocSummary(vectorData);
    }

    // build contextText
    let contextText = "";
    if (summaryHint)
      contextText += `Document Summary (hint):\n${safeSnippet(
        summaryHint,
        1200
      )}\n\n`;
    if (summaryText)
      contextText += `Document Summary (synthesized):\n${safeSnippet(
        summaryText,
        1200
      )}\n\n`;
    if (contextEntries.length > 0) {
      contextText += contextEntries
        .map((c) => safeSnippet(c.text, 1400))
        .join("\n\n");
    }

    // system prompt instructing natural behavior
    const systemPrompt = `
You are an assistant that answers questions about a PDF. Use ONLY the provided context snippets.
- If the user asks for the TITLE or AUTHOR(S), prefer information from the beginning of the document (front matter).
- If the user asks for REFERENCES or BIBLIOGRAPHY, try to list entries from sections labelled "References" or "Bibliography".
- For generic "what is this document about?" questions, synthesize a concise summary using the context.
- Ignore external site boilerplate (e.g., ResearchGate footers, "Download at", external links) unless explicitly asked.
Answer naturally and concisely. If the exact information is not present, say you couldn't find it clearly.
`.trim();

    const userPrompt = contextText
      ? `Context:\n${contextText}\n\nQuestion: ${query}`
      : `Question: ${query}`;

    // call the model
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

    // if assistant returned an explicit fallback or clear non-answer, be honest and say not found
    const lower = (answer || "").toLowerCase();
    const fallbackPhrases = [
      "i couldn't find",
      "i could not find",
      "i couldn't locate",
      "no relevant information",
      "i do not see",
    ];
    const isUnhelpful = fallbackPhrases.some((p) => lower.includes(p));
    if (isUnhelpful && summaryText) {
      // if it couldn't find but we have a summary, use the summary as reply
      answer = summaryText;
    } else if (isUnhelpful) {
      // preserve polite fallback
      answer =
        "I couldn't find that information in the document. Please try rephrasing the question.";
    }

    // prepare context output for UI (top snippets + scores)
    const contextOut = contextEntries.map((c) => ({
      text: c.text,
      score: c.score,
    }));

    const resp: any = {
      success: true,
      answer,
      context: contextOut,
      debug: { topScore, dimensionMismatch, vectorDim, queryDim: queryDim },
    };
    if (debug) resp.rawTop = contextEntries.slice(0, 8);

    return NextResponse.json(resp);
  } catch (err: unknown) {
    console.error("Error in /api/ask:", err);
    return NextResponse.json(
      {
        success: false,
        error: err instanceof Error ? err.message : String(err),
      },
      { status: 500 }
    );
  }
}
