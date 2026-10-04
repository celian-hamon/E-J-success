"use client";

export default function RetryButton({ label }: { label: string }) {
  return (
    <button className="btn btn-bright" onClick={() => location.reload()}>
      {label}
    </button>
  );
}
