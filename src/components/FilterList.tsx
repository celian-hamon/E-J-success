"use client";

import { useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { matches } from "@/lib/search";

export type FilterItem = {
  id: string;
  label: string;
  hint?: string; // shown after the label, also searchable
  badge?: string; // short tag shown before the label (e.g. a course code)
};

/**
 * A searchable checkbox list for forms. Checked boxes are submitted as `name`,
 * including ones hidden by the current search.
 */
export default function FilterList({
  name,
  items,
  placeholder,
  emptyText,
  maxHeight = 280,
}: {
  name: string;
  items: FilterItem[];
  placeholder: string;
  emptyText: string;
  maxHeight?: number;
}) {
  const t = useTranslations("filterList");
  const [query, setQuery] = useState("");
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const visible = useMemo(() => items.filter((i) => matches(query, i.label, i.hint, i.badge)), [items, query]);

  if (items.length === 0) return <p className="muted" style={{ margin: 0 }}>{emptyText}</p>;

  const toggle = (id: string, on: boolean) =>
    setChecked((prev) => {
      const next = new Set(prev);
      if (on) next.add(id);
      else next.delete(id);
      return next;
    });
  const allVisibleChecked = visible.length > 0 && visible.every((i) => checked.has(i.id));

  return (
    <div className="stack" style={{ gap: 8 }}>
      <input
        className="input"
        type="search"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder={placeholder}
        aria-label={placeholder}
      />
      <div className="spread" style={{ fontSize: 12.5 }}>
        <span className="muted">{t("summary", { shown: visible.length, total: items.length, selected: checked.size })}</span>
        <button
          type="button"
          className="btn btn-sm"
          disabled={visible.length === 0}
          onClick={() => visible.forEach((i) => toggle(i.id, !allVisibleChecked))}
        >
          {allVisibleChecked ? t("unselectShown") : t("selectShown")}
        </button>
      </div>
      <div className="stack" style={{ gap: 6, maxHeight, overflowY: "auto", paddingRight: 4 }}>
        {visible.length === 0 && <p className="muted" style={{ margin: 0, fontSize: 13 }}>{t("noMatch")}</p>}
        {items.map((i) => (
          <label key={i.id} className="check" style={{ display: visible.includes(i) ? undefined : "none" }}>
            <input type="checkbox" name={name} value={i.id} checked={checked.has(i.id)} onChange={(e) => toggle(i.id, e.target.checked)} />
            {i.badge && <span className="badge badge-violet">{i.badge}</span>}
            <span>{i.label}</span>
            {i.hint && <span className="muted">{i.hint}</span>}
          </label>
        ))}
      </div>
    </div>
  );
}
