// src/app/api/upload/route.ts
import { NextResponse } from "next/server";
import { extractTextFromPDF, chunkText } from "@/lib/pdf";
import { refineChunks } from "@/lib/chunkRefiner";
import crypto from "crypto";
import { mkdir, writeFile } from "fs/promises";
import path from "path";
import { processEmbeddings, Chunk } from "@/lib/embeddings";

interface PDFMetadata {
  title?: string;
  author?: string;
  emails?: string[];
  phones?: string[];
  urls?: string[];
  linkedin?: string;
  github?: string;
  skills?: string[];
}

function extractMetadata(text: string): PDFMetadata {
  const meta: PDFMetadata = {};
  if (!text || typeof text !== "string") return meta;

  const head = text.slice(0, 1200);
  const lines = head
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  if (lines.length > 0) {
    meta.title = lines[0];
  }
  const authorLine =
    lines.find((l) => /\b(author|by)\b[:\s]/i.test(l)) ||
    lines.find((l) => /^by\s+/i.test(l));
  if (authorLine) {
    meta.author = authorLine
      .replace(/^by\s+/i, "")
      .replace(/author[:\s-]*/i, "")
      .trim();
  }

  const emails = Array.from(
    new Set(
      text.match(/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g) || []
    )
  );
  if (emails.length) meta.emails = emails;

  const phones = Array.from(
    new Set(text.match(/(\+?\d[\d\-\s\(\)]{6,}\d)/g) || [])
  );
  if (phones.length) meta.phones = phones;

  const urls = Array.from(
    new Set(text.match(/\bhttps?:\/\/[^\s)'"<>]+/gi) || [])
  );
  if (urls.length) meta.urls = urls;

  const linkedIn = urls.find((u) => /linkedin\.com/i.test(u));
  const github = urls.find((u) => /github\.com/i.test(u));
  if (linkedIn) meta.linkedin = linkedIn;
  if (github) meta.github = github;

  const skillsMatch = text.match(/skills[:\s\r\n-]{0,3}([\s\S]{0,300})/i);
  if (skillsMatch && skillsMatch[1]) {
    const snippet = skillsMatch[1].split(/\r?\n/)[0] || skillsMatch[1];
    meta.skills = snippet
      .split(/[,\|;•]/)
      .map((s) => s.trim())
      .filter(Boolean)
      .slice(0, 50);
  } else {
    const techMatch = text.match(
      /(technologies|technical skills|skills and tools)[:\s\r\n-]{0,3}([\s\S]{0,300})/i
    );
    if (techMatch && techMatch[2]) {
      const snippet = techMatch[2].split(/\r?\n/)[0] || techMatch[2];
      meta.skills = snippet
        .split(/[,\|;•]/)
        .map((s) => s.trim())
        .filter(Boolean)
        .slice(0, 50);
    }
  }

  return meta;
}

export async function POST(req: Request) {
  try {
    const formData = await req.formData();
    const file = formData.get("file") as File;

    if (!file) {
      return NextResponse.json({ error: "No file uploaded" }, { status: 400 });
    }

    console.log("=== [UPLOAD] File received ===");
    console.log("File name:", file.name);
    console.log("File size (bytes):", file.size);

    const buffer = Buffer.from(await file.arrayBuffer());
    const text = await extractTextFromPDF(buffer);

    if (!text) {
      console.warn("⚠️ No text extracted — PDF may be scanned or image-based");
      return NextResponse.json({
        success: true,
        rawChunksCount: 0,
        refinedChunksCount: 0,
        sample: [],
        warning: "No text extracted — PDF may be scanned or image-based",
      });
    }

    console.log("=== [STEP 1] Raw Text Extracted ===");
    console.log("Text length (chars):", text.length);

    const rawChunks = chunkText(text);
    console.log("=== [STEP 2] Initial Chunking ===");
    console.log("Raw chunks:", rawChunks.length);
    console.log("First raw chunk sample:", rawChunks[0]?.slice(0, 200));

    console.log("=== [STEP 3] Refinement ===");
    const refinedChunks = refineChunks(rawChunks, 0, 200, 3);

    const totalTokens = refinedChunks.reduce(
      (sum, c) => sum + (c.tokenCount || 0),
      0
    );
    const avgTokens = refinedChunks.length
      ? Math.round(totalTokens / refinedChunks.length)
      : 0;
    const maxTokens = refinedChunks.length
      ? Math.max(...refinedChunks.map((c) => c.tokenCount || 0))
      : 0;

    console.log("=== [REFINEMENT SUMMARY] ===");
    console.log("Raw chunks:", rawChunks.length);
    console.log("Refined chunks:", refinedChunks.length);
    console.log("Total tokens:", totalTokens);
    console.log("Avg tokens per chunk:", avgTokens);
    console.log("Max tokens in a chunk:", maxTokens);
    console.log("First refined chunk:", refinedChunks[0]);

    const pdfId = crypto.randomUUID();
    try {
      const VECTOR_DIR = path.resolve("./vector");
      const META_DIR = path.join(VECTOR_DIR, "metadata");
      await mkdir(META_DIR, { recursive: true });
      const metadata = extractMetadata(text);
      try {
        await writeFile(
          path.join(META_DIR, `${pdfId}.json`),
          JSON.stringify(metadata, null, 2),
          "utf-8"
        );
        console.log("Saved metadata for pdfId:", pdfId, Object.keys(metadata));
      } catch (metaErr) {
        console.warn("Failed to write metadata file (non-fatal):", metaErr);
      }
    } catch (metaErr) {
      console.warn("Metadata save error (non-fatal):", metaErr);
    }

    // --------------------------
    // call embeddings directly (fire-and-forget)
    // --------------------------
    try {
      const chunksToEmbed: Chunk[] = refinedChunks.map((c) => ({
        id: c.id,
        text: c.text,
      }));

      processEmbeddings(pdfId, chunksToEmbed, 64)
        .then((count) =>
          console.log("Embeddings job finished, total vectors:", count)
        )
        .catch((err) => console.error("Embeddings job failed:", err));
    } catch (e) {
      console.error("Failed to launch embeddings job:", e);
    }

    return NextResponse.json({
      success: true,
      pdfId,
      rawChunksCount: rawChunks.length,
      refinedChunksCount: refinedChunks.length,
      totalTokens,
      avgTokens,
      maxTokens,
      sample: refinedChunks.slice(0, 3),
    });
  } catch (error) {
    console.error("❌ Upload API error:", error);
    return NextResponse.json(
      { error: "Failed to process PDF" },
      { status: 500 }
    );
  }
}
