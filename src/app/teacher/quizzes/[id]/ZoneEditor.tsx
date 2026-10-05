"use client";

// Draws the zones of a "hotspot" question on its image: drag to draw a rectangle, × to remove it.
// The zones go to the server action in a hidden "zones" field, as fractions of the image size.
// It follows the form's image field, so zones can be drawn on a new image before saving.

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { MAX_ZONES, type Zone } from "@/lib/question-types";

const pct = (v: number) => `${v * 100}%`;

export default function ZoneEditor({ imageUrl, initialZones }: { imageUrl: string | null; initialZones: Zone[] }) {
  const t = useTranslations("editor");
  const ref = useRef<HTMLDivElement>(null);
  const [src, setSrc] = useState(imageUrl);
  const [zones, setZones] = useState(initialZones);
  const [draft, setDraft] = useState<Zone | null>(null);
  const start = useRef<{ x: number; y: number } | null>(null);

  useEffect(() => {
    const form = ref.current?.closest("form");
    const file = form?.querySelector<HTMLInputElement>('input[type="file"][name="image"]');
    const remove = form?.querySelector<HTMLInputElement>('input[name="removeImage"]');
    let objectUrl: string | null = null;
    const update = () => {
      const picked = file?.files?.[0];
      if (objectUrl) URL.revokeObjectURL(objectUrl);
      objectUrl = picked ? URL.createObjectURL(picked) : null;
      setSrc(objectUrl ?? (remove?.checked ? null : imageUrl));
    };
    const onNewFile = () => {
      update();
      setZones([]); // zones drawn on the old image don't fit a new one
    };
    file?.addEventListener("change", onNewFile);
    remove?.addEventListener("change", update);
    return () => {
      file?.removeEventListener("change", onNewFile);
      remove?.removeEventListener("change", update);
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [imageUrl]);

  function at(e: React.PointerEvent<HTMLDivElement>) {
    const r = e.currentTarget.getBoundingClientRect();
    return { x: Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)), y: Math.min(1, Math.max(0, (e.clientY - r.top) / r.height)) };
  }

  return (
    <div ref={ref} className="zone-editor">
      <input type="hidden" name="zones" value={JSON.stringify(zones)} />
      {!src ? (
        <p className="muted" style={{ margin: 0, fontSize: 13 }}>{t("zonesNeedImage")}</p>
      ) : (
        <>
          <div
            className="zone-canvas"
            onPointerDown={(e) => {
              if (zones.length >= MAX_ZONES || (e.target as HTMLElement).closest("button")) return;
              e.currentTarget.setPointerCapture(e.pointerId);
              start.current = at(e);
            }}
            onPointerMove={(e) => {
              if (!start.current) return;
              const p = at(e);
              const s = start.current;
              setDraft({ x: Math.min(s.x, p.x), y: Math.min(s.y, p.y), w: Math.abs(p.x - s.x), h: Math.abs(p.y - s.y) });
            }}
            onPointerUp={() => {
              if (draft && draft.w > 0.01 && draft.h > 0.01) setZones((z) => [...z, draft]);
              start.current = null;
              setDraft(null);
            }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={src} alt="" draggable={false} />
            {zones.map((z, i) => (
              <span key={i} className="hotspot-zone editing" style={{ left: pct(z.x), top: pct(z.y), width: pct(z.w), height: pct(z.h) }}>
                <button type="button" className="zone-remove" onClick={() => setZones((all) => all.filter((_, j) => j !== i))} aria-label={t("removeZone", { n: i + 1 })}>
                  ×
                </button>
              </span>
            ))}
            {draft && <span className="hotspot-zone draft" style={{ left: pct(draft.x), top: pct(draft.y), width: pct(draft.w), height: pct(draft.h) }} />}
          </div>
          <p className="muted" style={{ margin: 0, fontSize: 13 }}>
            {zones.length === 0 ? t("zonesHint") : t("zonesCount", { count: zones.length, max: MAX_ZONES })}
          </p>
        </>
      )}
    </div>
  );
}
