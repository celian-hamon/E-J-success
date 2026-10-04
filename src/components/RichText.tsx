import { Fragment } from "react";
import { parseMath, renderMath } from "@/lib/latex";

/**
 * Renders quiz text with LaTeX formulas ($…$ inline, $$…$$ display). Plain text stays
 * plain text (React escapes it); only KaTeX's own output is inserted as HTML.
 */
export default function RichText({ text }: { text: string | null | undefined }) {
  if (!text) return null;
  return (
    <>
      {parseMath(text).map((seg, i) =>
        seg.type === "text" ? (
          <Fragment key={i}>{seg.value}</Fragment>
        ) : (
          <span
            key={i}
            className={seg.display ? "math-display" : "math-inline"}
            dangerouslySetInnerHTML={{ __html: renderMath(seg.value, seg.display) }}
          />
        ),
      )}
    </>
  );
}
