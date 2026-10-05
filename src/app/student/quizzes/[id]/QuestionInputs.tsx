"use client";

// Answer inputs for the question types other than multiple choice. Each one collects a
// response, sends it with "Validate", then shows the solution the server sent back.

import { useRef, useState } from "react";
import { useFormatter, useTranslations } from "next-intl";
import RichText from "@/components/RichText";
import {
  parseNumber,
  type AnswerResponse,
  type CategorizeResponse,
  type HotspotResponse,
  type OrderResponse,
  type Solution,
} from "@/lib/question-types";
import type { PlayerQuestion } from "./QuizPlayer";

type InputProps = {
  question: PlayerQuestion;
  locked: boolean; // answered (or time up): no more changes
  solution: Solution | null | undefined; // known once graded online
  onSubmit: (response: AnswerResponse) => void;
};

/** An item to order or to sort: its image and/or text. */
function Item({ item, n }: { item: PlayerQuestion["choices"][number]; n?: number }) {
  return (
    <span className="item-body">
      {n !== undefined && <span className="key">{n}</span>}
      {item.image && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={item.image} alt={item.text} className="item-image" />
      )}
      {item.text && <span><RichText text={item.text} /></span>}
    </span>
  );
}

export function HotspotInput({ question, locked, solution, onSubmit }: InputProps) {
  const t = useTranslations("player");
  const [point, setPoint] = useState<HotspotResponse | null>(null);
  const zones = solution?.type === "hotspot" ? solution.zones : [];

  function place(e: React.MouseEvent<HTMLDivElement>) {
    if (locked) return;
    const r = e.currentTarget.getBoundingClientRect();
    setPoint({ x: (e.clientX - r.left) / r.width, y: (e.clientY - r.top) / r.height });
  }

  if (!question.image) return null;
  return (
    <div className="type-input">
      {!locked && <p className="muted type-hint">{t("hotspotHint")}</p>}
      <div className={`hotspot ${locked ? "locked" : ""}`} onClick={place}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={question.image} alt={t("questionImage")} draggable={false} />
        {zones.map((z, i) => (
          <span key={i} className="hotspot-zone" style={{ left: `${z.x * 100}%`, top: `${z.y * 100}%`, width: `${z.w * 100}%`, height: `${z.h * 100}%` }} />
        ))}
        {point && <span className="hotspot-marker" style={{ left: `${point.x * 100}%`, top: `${point.y * 100}%` }} aria-label={t("yourClick")} />}
      </div>
      {!locked && (
        <button className="btn btn-bright" disabled={!point} onClick={() => point && onSubmit(point)}>
          {t("validate")}
        </button>
      )}
    </div>
  );
}

export function OrderInput({ question, locked, solution, onSubmit }: InputProps) {
  const t = useTranslations("player");
  const [items, setItems] = useState(question.choices);
  const dragFrom = useRef<number | null>(null);
  const right = solution?.type === "order" ? solution.order : null;

  function move(from: number, to: number) {
    if (locked || to < 0 || to >= items.length || from === to) return;
    setItems((list) => {
      const next = [...list];
      const [it] = next.splice(from, 1);
      next.splice(to, 0, it);
      return next;
    });
  }

  const byId = new Map(question.choices.map((c) => [c.id, c]));
  const allRight = right !== null && items.every((it, i) => it.id === right[i]);
  return (
    <div className="type-input">
      {!locked && <p className="muted type-hint">{t("orderHint")}</p>}
      <ol className="order-list">
        {items.map((it, i) => (
          <li
            key={it.id}
            className={`order-item ${right ? (it.id === right[i] ? "correct" : "wrong") : ""}`}
            draggable={!locked}
            onDragStart={() => (dragFrom.current = i)}
            onDragOver={(e) => !locked && e.preventDefault()}
            onDrop={() => {
              if (dragFrom.current !== null) move(dragFrom.current, i);
              dragFrom.current = null;
            }}
          >
            <Item item={it} n={i + 1} />
            {!locked && (
              <span className="order-moves">
                <button type="button" className="btn btn-sm" onClick={() => move(i, i - 1)} disabled={i === 0} aria-label={t("moveUp")}>↑</button>
                <button type="button" className="btn btn-sm" onClick={() => move(i, i + 1)} disabled={i === items.length - 1} aria-label={t("moveDown")}>↓</button>
              </span>
            )}
          </li>
        ))}
      </ol>
      {right && !allRight && (
        <div className="solution">
          <span className="label">{t("rightOrder")}</span>
          <ol className="order-list compact">
            {right.map((id, i) => byId.get(id) && (
              <li key={id} className="order-item"><Item item={byId.get(id)!} n={i + 1} /></li>
            ))}
          </ol>
        </div>
      )}
      {!locked && (
        <button className="btn btn-bright" onClick={() => onSubmit(items.map((it) => it.id) as OrderResponse)}>
          {t("validate")}
        </button>
      )}
    </div>
  );
}

export function CategorizeInput({ question, locked, solution, onSubmit }: InputProps) {
  const t = useTranslations("player");
  const [groups, setGroups] = useState<CategorizeResponse>({});
  const categories = question.categories ?? [];
  const right = solution?.type === "categorize" ? solution.groups : null;
  const done = question.choices.every((c) => groups[c.id] !== undefined);

  return (
    <div className="type-input">
      {!locked && <p className="muted type-hint">{t("categorizeHint")}</p>}
      <div className="sort-list">
        {question.choices.map((it) => {
          const mine = groups[it.id];
          const ok = right ? right[it.id] === mine : null;
          return (
            <div key={it.id} className={`sort-item ${ok === null ? "" : ok ? "correct" : "wrong"}`}>
              <Item item={it} />
              <div className="sort-chips" role="radiogroup" aria-label={it.text}>
                {categories.map((cat, g) => (
                  <button
                    key={g}
                    type="button"
                    role="radio"
                    aria-checked={mine === g}
                    className={`chip-btn ${mine === g ? "on" : ""} ${right && right[it.id] === g ? "right" : ""}`}
                    disabled={locked}
                    onClick={() => setGroups((m) => ({ ...m, [it.id]: g }))}
                  >
                    <RichText text={cat} />
                  </button>
                ))}
              </div>
            </div>
          );
        })}
      </div>
      {!locked && (
        <button className="btn btn-bright" disabled={!done} onClick={() => onSubmit(groups)}>
          {done ? t("validate") : t("categorizeLeft", { count: question.choices.filter((c) => groups[c.id] === undefined).length })}
        </button>
      )}
    </div>
  );
}

export function NumericInput({ question, locked, solution, onSubmit }: InputProps) {
  const t = useTranslations("player");
  const format = useFormatter();
  const [value, setValue] = useState("");
  const n = parseNumber(value);
  const right = solution?.type === "numeric" ? solution : null;
  const unit = question.unit ? ` ${question.unit}` : "";

  return (
    <div className="type-input">
      <form
        className="numeric"
        onSubmit={(e) => {
          e.preventDefault();
          if (!locked && n !== null) onSubmit(value);
        }}
      >
        <input
          className="input numeric-input"
          inputMode="decimal"
          autoComplete="off"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder={t("numericPlaceholder")}
          disabled={locked}
          autoFocus
          aria-invalid={value !== "" && n === null}
        />
        {question.unit && <span className="numeric-unit"><RichText text={question.unit} /></span>}
        {!locked && (
          <button className="btn btn-bright" type="submit" disabled={n === null}>
            {t("validate")}
          </button>
        )}
      </form>
      {!locked && <p className="muted type-hint">{value !== "" && n === null ? t("numericInvalid") : t("numericHint")}</p>}
      {right && (
        <p className="solution">
          {t("rightValue", { value: format.number(right.answer, { maximumFractionDigits: 6 }) + unit })}
          {right.tolerance > 0 && ` ${t("tolerance", { value: format.number(right.tolerance, { maximumFractionDigits: 6 }) })}`}
        </p>
      )}
    </div>
  );
}
