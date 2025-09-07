// src/app/api/delete-pdf/route.ts
import { NextResponse } from "next/server";
import { unlink } from "fs/promises";
import path from "path";

const VECTOR_DIR = path.resolve("./vector");
const STATUS_DIR = path.join(VECTOR_DIR, "status");
const METADATA_DIR = path.join(VECTOR_DIR, "metadata");

export async function POST(req: Request) {
  try {
    const { pdfId } = await req.json();

    if (!pdfId) {
      return NextResponse.json(
        { success: false, error: "Missing pdfId" },
        { status: 400 }
      );
    }

    const filesToDelete = [
      path.join(VECTOR_DIR, `${pdfId}.json`),
      path.join(METADATA_DIR, `${pdfId}.json`),
      path.join(STATUS_DIR, `${pdfId}.json`),
    ];

    let deleted: string[] = [];
    let notFound: string[] = [];

    for (const file of filesToDelete) {
      try {
        await unlink(file);
        deleted.push(file);
      } catch (err: any) {
        if (err.code === "ENOENT") {
          notFound.push(file);
        } else {
          throw err;
        }
      }
    }

    return NextResponse.json({
      success: true,
      pdfId,
      deleted,
      notFound,
      message: "PDF data and vectors deleted permanently.",
    });
  } catch (error: any) {
    console.error("❌ Delete API error:", error);
    return NextResponse.json(
      { success: false, error: String(error?.message ?? error) },
      { status: 500 }
    );
  }
}
