import Link from "next/link";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { getCurrentUser } from "@/lib/auth";
import { ROLE_HOME } from "@/lib/roles";

export default async function Landing() {
  const user = await getCurrentUser();
  if (user) redirect(ROLE_HOME[user.role]);
  const t = await getTranslations("landing");

  return (
    <>
      <section className="hero glass" aria-labelledby="heroTitle">
        <p className="eyebrow intro">{t("eyebrow")}</p>
        <h1 id="heroTitle" className="intro intro-2">
          <span>{t.rich("titleLine1", { tint: (c) => <em className="tint">{c}</em> })}</span>{" "}
          <span className="l2">{t.rich("titleLine2", { tint: (c) => <em className="tint">{c}</em> })}</span>
        </h1>
        <div className="hero-body intro intro-3">
          <div>
            <p className="lede">{t("lede")}</p>
            <div className="cta-row">
              <Link className="btn btn-bright" href="/login">
                {t("signIn")}
                <svg viewBox="0 0 16 16" aria-hidden="true">
                  <path d="M3 8h9M8.5 4.5 12 8l-3.5 3.5" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </Link>
              <a className="btn" href="#how">{t("howItWorks")}</a>
            </div>
          </div>
          <aside className="legend glass" aria-labelledby="legendTitle">
            <h2 id="legendTitle">{t("legendTitle")}</h2>
            <ol>
              <li><b>1</b><span>{t("step1")}</span></li>
              <li><b>2</b><span>{t("step2")}</span></li>
              <li><b>3</b><span>{t("step3")}</span></li>
            </ol>
          </aside>
        </div>
      </section>

      <section className="section" id="how" aria-labelledby="howTitle">
        <div className="sec-head">
          <p className="eyebrow">{t("howEyebrow")}</p>
          <h2 id="howTitle">{t.rich("howTitle", { tint: (c) => <em className="tint">{c}</em> })}</h2>
          <p>{t("howLede")}</p>
        </div>
        <div className="cards wrap" id="roles">
          {(["admin", "teacher", "student"] as const).map((k, i) => (
            <article key={k} className={`card glass c${i + 1}`}>
              <h3>{t(`cards.${k}.title`)}</h3>
              <p>{t(`cards.${k}.text`)}</p>
              <p className="meta">{t(`cards.${k}.meta`)}</p>
            </article>
          ))}
        </div>
      </section>
    </>
  );
}
