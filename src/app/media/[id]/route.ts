import { getCurrentUser } from "@/lib/auth";
import { readMedia } from "@/lib/media";

export const runtime = "nodejs";

// Quiz images, for signed-in users only. Ids never change content, so the browser and
// the service worker can cache them for good (it also makes them available offline).
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return new Response("Unauthorized", { status: 401 });
  const found = await readMedia((await params).id);
  if (!found) return new Response("Not found", { status: 404 });
  return new Response(new Uint8Array(found.data), {
    headers: {
      "Content-Type": found.media.mimeType,
      "Content-Length": String(found.data.length),
      "Cache-Control": "private, max-age=31536000, immutable",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
