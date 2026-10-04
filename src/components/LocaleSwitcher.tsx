"use client";

import { useLocale, useTranslations } from "next-intl";
import { LOCALES, LOCALE_LABELS } from "@/i18n/config";
import { setLocale } from "@/app/actions/locale";

export default function LocaleSwitcher() {
  const locale = useLocale();
  const t = useTranslations("common");
  return (
    <form action={setLocale} className="row" style={{ gap: 8 }}>
      <label htmlFor="locale" className="muted" style={{ fontSize: 12.5 }}>
        {t("language")}
      </label>
      <select
        id="locale"
        name="locale"
        className="select"
        defaultValue={locale}
        style={{ width: "auto", padding: "6px 12px", fontSize: 13 }}
        onChange={(e) => e.currentTarget.form?.requestSubmit()}
      >
        {LOCALES.map((l) => (
          <option key={l} value={l}>
            {LOCALE_LABELS[l]}
          </option>
        ))}
      </select>
      <noscript>
        <button className="btn btn-sm" type="submit">OK</button>
      </noscript>
    </form>
  );
}
