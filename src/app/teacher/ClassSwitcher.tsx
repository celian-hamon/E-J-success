"use client";

import Link from "next/link";
import { TEACHER_CLASS_COOKIE } from "@/lib/teacher-class";

/** One chip per class (plus "all"); the choice is remembered in a cookie for the next visit. */
export default function ClassSwitcher({
  classes,
  current,
  allLabel,
  label,
}: {
  classes: { id: string; name: string }[];
  current: string; // a class id, or "all"
  allLabel: string;
  label: string;
}) {
  const remember = (value: string) => {
    document.cookie = `${TEACHER_CLASS_COOKIE}=${encodeURIComponent(value)}; path=/; max-age=31536000; samesite=lax`;
  };
  const chips = [{ id: "all", name: allLabel }, ...classes];
  return (
    <nav className="class-switch" aria-label={label}>
      {chips.map((c) => (
        <Link
          key={c.id}
          href={`/teacher?class=${c.id}`}
          aria-current={c.id === current ? "page" : undefined}
          onClick={() => remember(c.id)}
        >
          {c.name}
        </Link>
      ))}
    </nav>
  );
}
