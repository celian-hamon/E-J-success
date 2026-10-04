import Link from "next/link";

export const APP_NAME = "E-J Success";

export function BrandMark() {
  return (
    <svg viewBox="0 0 32 32" aria-hidden="true">
      <defs>
        <linearGradient id="bm" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#2de2c4" />
          <stop offset=".55" stopColor="#7b5cff" />
          <stop offset="1" stopColor="#ff6fa8" />
        </linearGradient>
      </defs>
      <circle cx="16" cy="16" r="14.5" fill="none" stroke="url(#bm)" strokeWidth="1.2" opacity=".55" />
      <circle cx="16" cy="16" r="9.5" fill="none" stroke="url(#bm)" strokeWidth="1.2" opacity=".85" />
      <circle cx="16" cy="16" r="4.4" fill="url(#bm)" />
    </svg>
  );
}

export function Brand({ href = "/" }: { href?: string }) {
  return (
    <Link className="brand" href={href}>
      <BrandMark />
      <span>{APP_NAME}</span>
    </Link>
  );
}
