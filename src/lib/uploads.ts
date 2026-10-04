import "server-only";
import { mkdir, unlink, writeFile } from "node:fs/promises";
import path from "node:path";

// Source PDFs live in ./uploads (outside /public, so they aren't served directly).
// Swap these two functions for S3/R2/Blob storage when deploying.
const UPLOAD_DIR = path.join(process.cwd(), "uploads");

/** Saves the file and returns the stored name to keep in Quiz.sourceFilePath. */
export async function saveQuizPdf(quizId: string, bytes: Buffer) {
  await mkdir(UPLOAD_DIR, { recursive: true });
  const name = `${quizId}.pdf`;
  await writeFile(path.join(UPLOAD_DIR, name), bytes);
  return name;
}

export async function deleteQuizPdf(name: string) {
  await unlink(path.join(UPLOAD_DIR, path.basename(name))).catch(() => {});
}
