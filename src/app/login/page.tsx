import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { getCurrentUser } from "@/lib/auth";
import { ROLE_HOME } from "@/lib/roles";
import LoginForm from "./LoginForm";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations("login"))("title") };
}

export default async function LoginPage() {
  const user = await getCurrentUser();
  if (user) redirect(ROLE_HOME[user.role]);
  const t = await getTranslations("login");

  return (
    <div className="auth">
      <div className="auth-card glass intro">
        <p className="eyebrow">{t("eyebrow")}</p>
        <h1>{t("title")}</h1>
        <p className="muted" style={{ marginTop: 0 }}>{t("subtitle")}</p>
        <LoginForm />
      </div>
    </div>
  );
}
