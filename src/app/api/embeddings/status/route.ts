// src/app/api/embeddings/status/route.ts
import { NextResponse } from "next/server";
import fs from "fs";
import path from "path";

const STATUS_DIR = path.resolve("./vector/status");

// Tiny safe JSON helper to avoid partial reads
function safeParseJSON(text: string) {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const pdfId = url.searchParams.get("pdfId");
    if (!pdfId) {
      return NextResponse.json(
        { success: false, error: "pdfId required" },
        { status: 400 }
      );
    }

    const statusPath = path.join(STATUS_DIR, `${pdfId}.json`);
    if (!fs.existsSync(statusPath)) {
      return NextResponse.json(
        { success: false, error: "Status not found" },
        { status: 404 }
      );
    }

    // Read once; if it's mid-write or empty, return "processing"
    let raw = "";
    try {
      raw = fs.readFileSync(statusPath, "utf-8");
    } catch {
      return NextResponse.json({
        success: true,
        status: { pdfId, status: "processing" },
      });
    }

    if (!raw || !raw.trim()) {
      return NextResponse.json({
        success: true,
        status: { pdfId, status: "processing" },
      });
    }

    const parsed = safeParseJSON(raw);
    if (!parsed) {
      // The writer might be mid-write → treat as processing instead of throwing
      return NextResponse.json({
        success: true,
        status: { pdfId, status: "processing" },
      });
    }

    // Ensure pdfId is present in the payload we return
    const status = { pdfId, ...parsed };
    return NextResponse.json({ success: true, status });
  } catch (err: unknown) {
    console.error("Status error:", err);
    return NextResponse.json(
      {
        success: false,
        error: err instanceof Error ? err.message : String(err),
      },
      { status: 500 }
    );
  }
}
