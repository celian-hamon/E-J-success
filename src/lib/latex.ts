import katex from "katex";

// Text with LaTeX math: $…$ for inline formulas, $$…$$ for display formulas.
// A literal dollar sign is written \$. Rendering happens with KaTeX (no network, works
// offline and on the server).
export type Segment = { type: "text"; value: string } | { type: "math"; value: string; display: boolean };

export function parseMath(input: string): Segment[] {
  const out: Segment[] = [];
  let text = "";
  let i = 0;
  while (i < input.length) {
    if (input[i] === "\\" && input[i + 1] === "$") {
      text += "$";
      i += 2;
      continue;
    }
    if (input[i] === "$") {
      const display = input[i + 1] === "$";
      const open = display ? 2 : 1;
      const close = input.indexOf(display ? "$$" : "$", i + open);
      // Unclosed or empty "$": keep it as plain text (e.g. a price).
      if (close > i + open) {
        if (text) out.push({ type: "text", value: text });
        text = "";
        out.push({ type: "math", value: input.slice(i + open, close), display });
        i = close + open;
        continue;
      }
    }
    text += input[i];
    i++;
  }
  if (text) out.push({ type: "text", value: text });
  return out;
}

export function hasMath(input: string | null | undefined) {
  return !!input && parseMath(input).some((s) => s.type === "math");
}

/** KaTeX HTML for one formula. Invalid LaTeX is shown in red instead of throwing. */
export function renderMath(tex: string, display: boolean) {
  return katex.renderToString(tex, { displayMode: display, throwOnError: false, strict: "ignore", output: "html" });
}
