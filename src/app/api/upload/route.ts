// src/app/api/upload/route.ts
import { NextResponse } from "next/server";
import { extractTextFromPDF, chunkText } from "@/lib/pdf";
import { refineChunks } from "@/lib/chunkRefiner";
import crypto from "crypto";
import path from "path";
import { processEmbeddings, Chunk } from "@/lib/embeddings";

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

    // chunk & refine
    const rawChunks = chunkText(text);
    console.log("=== [STEP 2] Initial Chunking ===");
    console.log("Raw chunks:", rawChunks.length);
    console.log("First raw chunk sample:", rawChunks[0]?.slice(0, 200));

    const refinedChunks = refineChunks(rawChunks, 0, 200, 3);
    console.log("=== [STEP 3] Refinement ===");
    console.log("Refined chunks:", refinedChunks.length);
    console.log(
      "First refined chunk preview:",
      refinedChunks[0]?.text?.slice(0, 200) ?? ""
    );

    const pdfId = crypto.randomUUID();

    // start embeddings job (fire-and-forget)
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
