"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

/** Main menu links; the one for the current section is marked (most specific match wins). */
export default function NavLinks({ links, label }: { links: { href: string; label: string }[]; label: string }) {
  const pathname = usePathname();
  const current = links
    .filter((l) => pathname === l.href || pathname.startsWith(`${l.href}/`))
    .sort((a, b) => b.href.length - a.href.length)[0]?.href;
  return (
    <nav className="nav-links" aria-label={label}>
      {links.map((l) => (
        <Link key={l.href} href={l.href} aria-current={l.href === current ? "page" : undefined}>
          {l.label}
        </Link>
      ))}
    </nav>
  );
}
