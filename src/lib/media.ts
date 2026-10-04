import "server-only";
import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import { db } from "./db";

// Images live in ./uploads/media (outside /public) and are served by /media/<id> to
// signed-in users. Every upload is re-encoded: EXIF rotation applied, metadata stripped,
// longest side capped at 1600 px, saved as WebP. SVG is refused (it can carry scripts).
const MEDIA_DIR = path.join(process.cwd(), "uploads", "media");
const MAX_INPUT_BYTES = 10 * 1024 * 1024;
const ACCEPTED = ["image/png", "image/jpeg", "image/webp", "image/gif", "image/avif"];

export class MediaError extends Error {
  constructor(public code: "type" | "size" | "invalid") {
    super(code);
  }
}

function fileFor(id: string) {
  return path.join(MEDIA_DIR, `${path.basename(id)}.webp`);
}

export function mediaUrl(id: string | null | undefined) {
  return id ? `/media/${id}` : null;
}

/** True when the form field holds an actual uploaded file. */
export function isUpload(value: FormDataEntryValue | null): value is File {
  return value instanceof File && value.size > 0;
}

export async function saveImage(file: File, uploadedById: string | null) {
  if (!ACCEPTED.includes(file.type)) throw new MediaError("type");
  if (file.size > MAX_INPUT_BYTES) throw new MediaError("size");
  return storeImage(Buffer.from(await file.arrayBuffer()), file.type === "image/gif", uploadedById);
}

// Formats sharp may report for the accepted types (AVIF is read through libheif).
const ACCEPTED_FORMATS = ["png", "jpeg", "webp", "gif", "heif"];

/** Same as saveImage, for raw bytes whose type is unknown (e.g. decoded base64): sniffs the format first. */
export async function saveImageBytes(input: Buffer, uploadedById: string | null) {
  if (input.length > MAX_INPUT_BYTES) throw new MediaError("size");
  let format: string | undefined;
  try {
    format = (await sharp(input).metadata()).format;
  } catch {
    throw new MediaError("invalid");
  }
  if (!format || !ACCEPTED_FORMATS.includes(format)) throw new MediaError("type");
  return storeImage(input, format === "gif", uploadedById);
}

async function storeImage(input: Buffer, animated: boolean, uploadedById: string | null) {
  let output: Buffer;
  let info: { width: number; height: number; pageHeight?: number };
  try {
    ({ data: output, info } = await sharp(input, { animated })
      .rotate()
      .resize({ width: 1600, height: 1600, fit: "inside", withoutEnlargement: true })
      .webp({ quality: 82 })
      .toBuffer({ resolveWithObject: true }));
  } catch {
    throw new MediaError("invalid");
  }

  const media = await db.media.create({
    data: { mimeType: "image/webp", size: output.length, width: info.width, height: info.pageHeight ?? info.height, uploadedById },
  });
  await mkdir(MEDIA_DIR, { recursive: true });
  await writeFile(fileFor(media.id), output);
  return media;
}

export async function readMedia(id: string) {
  const media = await db.media.findUnique({ where: { id } });
  if (!media) return null;
  try {
    return { media, data: await readFile(fileFor(id)) };
  } catch {
    return null;
  }
}

/** Deletes an image once no question or answer uses it any more. */
export async function releaseMedia(id: string | null | undefined) {
  if (!id) return;
  const [q, c] = await Promise.all([db.question.count({ where: { imageId: id } }), db.choice.count({ where: { imageId: id } })]);
  if (q + c > 0) return;
  await db.media.deleteMany({ where: { id } });
  await unlink(fileFor(id)).catch(() => {});
}
