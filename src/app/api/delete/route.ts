// src/app/api/delete/route.ts
import { NextResponse } from "next/server";
import { unlink } from "fs/promises";
import path from "path";

const VECTOR_DIR = path.resolve("./vector");
const STATUS_DIR = path.join(VECTOR_DIR, "status");
const METADATA_DIR = path.join(VECTOR_DIR, "metadata");

export async function POST(req: Request) {
  try {
    const { pdfId } = (await req.json()) as { pdfId: string };

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
      } catch (err: unknown) {
        if (
          (err as NodeJS.ErrnoException).code === "ENOENT" ||
          (err as any).message?.includes("no such file or directory")
        ) {
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
  } catch (error: unknown) {
    console.error("❌ Delete API error:", error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}
