"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";
import { login, type LoginState } from "@/app/actions/auth";

export default function LoginForm() {
  const t = useTranslations("login");
  const [state, action, pending] = useActionState<LoginState, FormData>(login, {});

  return (
    <form className="form" action={action}>
      {state.error && <div className="alert alert-error">{t(`errors.${state.error}`)}</div>}
      <label className="field">
        <span>{t("email")}</span>
        <input className="input" name="email" type="email" autoComplete="email" required />
      </label>
      <label className="field">
        <span>{t("password")}</span>
        <input className="input" name="password" type="password" autoComplete="current-password" required />
      </label>
      <button className="btn btn-bright" type="submit" disabled={pending}>
        {pending ? t("submitting") : t("submit")}
      </button>
    </form>
  );
}
