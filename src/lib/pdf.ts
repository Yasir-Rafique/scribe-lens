// src/lib/pdf.ts

//const pdf = require("pdf-parse/lib/pdf-parse.js");
import pdf from "pdf-parse/lib/pdf-parse.js";

export async function extractTextFromPDF(fileBuffer: Buffer): Promise<string> {
  const data = await pdf(fileBuffer);
  const text = (data.text || "").trim();
  return text;
}

export function chunkText(text: string, size = 500): string[] {
  if (!text) return [];
  const chunks: string[] = [];
  let i = 0;
  while (i < text.length) {
    chunks.push(text.slice(i, i + size));
    i += size;
  }
  return chunks;
}
