import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import RetryButton from "./RetryButton";

// Shown by the service worker when a page isn't in the cache and the network is down.
// It must not depend on the signed-in user, so it can be pre-cached.
export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations("offline"))("title") };
}

export default async function OfflinePage() {
  const t = await getTranslations("offline");
  return (
    <div className="auth">
      <div className="auth-card glass intro" style={{ textAlign: "center" }}>
        <p className="eyebrow" style={{ justifyContent: "center" }}>{t("eyebrow")}</p>
        <h1>{t("title")}</h1>
        <p className="muted">{t("text")}</p>
        <div className="row" style={{ justifyContent: "center" }}>
          <RetryButton label={t("retry")} />
          <a className="btn" href="/">{t("home")}</a>
        </div>
      </div>
    </div>
  );
}
