"use client";

import { useRef } from "react";
import { usePathname, useRouter } from "next/navigation";

/**
 * A GET filter form that updates the URL as you type (debounced) or change a select,
 * so results refresh instantly and the filtered view can be bookmarked or shared.
 * Without JavaScript it still works as a normal GET form.
 */
export default function AutoFilterForm({ children, className }: { children: React.ReactNode; className?: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  function apply(form: HTMLFormElement, delay: number) {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      const params = new URLSearchParams();
      new FormData(form).forEach((v, k) => {
        if (typeof v === "string" && v) params.set(k, v);
      });
      const qs = params.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    }, delay);
  }

  return (
    <form
      method="get"
      className={className}
      onChange={(e) => apply(e.currentTarget, (e.target as HTMLElement).tagName === "INPUT" ? 300 : 0)}
      onSubmit={(e) => {
        e.preventDefault();
        apply(e.currentTarget, 0);
      }}
    >
      {children}
    </form>
  );
}
