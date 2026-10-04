import type { Metadata, Viewport } from "next";
import { NextIntlClientProvider } from "next-intl";
import { getLocale, getTranslations } from "next-intl/server";
import AuroraSky from "@/components/AuroraSky";
import Nav from "@/components/Nav";
import LocaleSwitcher from "@/components/LocaleSwitcher";
import PwaClient from "@/components/pwa/PwaClient";
import { APP_NAME } from "@/components/Brand";
import { getCurrentUser } from "@/lib/auth";
import "katex/dist/katex.min.css";
import "./globals.css";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("meta");
  return {
    title: { default: APP_NAME, template: `%s · ${APP_NAME}` },
    description: t("description"),
    applicationName: APP_NAME,
    appleWebApp: { capable: true, title: APP_NAME, statusBarStyle: "black-translucent" },
    icons: { icon: "/icons/icon.svg", apple: "/icons/apple-touch-icon.png" },
  };
}

export const viewport: Viewport = { themeColor: "#070b1f", viewportFit: "cover" };

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const [locale, t, user] = await Promise.all([getLocale(), getTranslations("common"), getCurrentUser()]);

  return (
    <html lang={locale} data-scroll-behavior="smooth">
      <body>
        <NextIntlClientProvider>
          <AuroraSky />
          <div className="page">
            <Nav />
            <main id="main">{children}</main>
            <footer className="site-footer glass">
              <p>{t("footer", { app: APP_NAME })}</p>
              <LocaleSwitcher />
            </footer>
          </div>
          <PwaClient userId={user?.id ?? null} role={user?.role ?? null} />
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
