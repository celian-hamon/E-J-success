import { redirect } from "next/navigation";

// Plain-form server actions report back by redirecting with ?ok= or ?error=,
// which the page renders with <Flash />.
export function flash(path: string, kind: "ok" | "error", message: string): never {
  const sep = path.includes("?") ? "&" : "?";
  redirect(`${path}${sep}${kind}=${encodeURIComponent(message)}`);
}

export type SearchParams = Promise<Record<string, string | string[] | undefined>>;
