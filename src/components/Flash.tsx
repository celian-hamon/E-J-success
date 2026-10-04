import type { SearchParams } from "@/lib/flash";

export default async function Flash({ searchParams }: { searchParams: SearchParams }) {
  const sp = await searchParams;
  const ok = typeof sp.ok === "string" ? sp.ok : null;
  const error = typeof sp.error === "string" ? sp.error : null;
  if (!ok && !error) return null;
  return <div className={`alert ${error ? "alert-error" : "alert-ok"}`}>{error ?? ok}</div>;
}
