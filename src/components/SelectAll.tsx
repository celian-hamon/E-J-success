"use client";

/** Header checkbox that ticks every checkbox named `name` belonging to form `form`. */
export default function SelectAll({ form, name, label }: { form: string; name: string; label: string }) {
  return (
    <input
      type="checkbox"
      aria-label={label}
      title={label}
      onChange={(e) => {
        document
          .querySelectorAll<HTMLInputElement>(`input[type=checkbox][name="${name}"][form="${form}"]`)
          .forEach((box) => (box.checked = e.currentTarget.checked));
      }}
    />
  );
}
