"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { flushRuns, listRuns, type SyncResult } from "@/lib/offline/outbox";

type Synced = SyncResult["synced"];
type InstallPrompt = Event & { prompt(): Promise<void>; userChoice: Promise<{ outcome: string }> };

const USER_KEY = "ejs-cache-owner"; // "<userId>|<locale>" the cached pages belong to
const WARMED_KEY = "ejs-warmed-at";
const WARM_EVERY_MS = 10 * 60 * 1000;
// The service worker runs in production builds; set NEXT_PUBLIC_SW_DEV=1 to try it with `next dev`.
const SW_ENABLED = process.env.NODE_ENV === "production" || process.env.NEXT_PUBLIC_SW_DEV === "1";

function post(msg: object) {
  navigator.serviceWorker?.controller?.postMessage(msg);
}

/**
 * Registers the service worker and keeps the offline experience in step with the user:
 * pre-caches their pages, clears cached pages when the user changes, shows the
 * offline banner, and resyncs offline quiz runs when the connection comes back.
 */
export default function PwaClient({ userId, role }: { userId: string | null; role: string | null }) {
  const t = useTranslations("pwa");
  const locale = useLocale();
  const router = useRouter();
  const [online, setOnline] = useState(true);
  const [pending, setPending] = useState(0);
  const [synced, setSynced] = useState<Synced>([]);
  const [install, setInstall] = useState<InstallPrompt | null>(null);
  const syncing = useRef(false);

  const refreshPending = useCallback(async () => {
    if (!userId || role !== "STUDENT") return setPending(0);
    try {
      setPending((await listRuns(userId)).length);
    } catch {
      /* IndexedDB unavailable (private mode) */
    }
  }, [userId, role]);

  const warm = useCallback(
    async (force = false) => {
      if (!userId || !navigator.onLine || !navigator.serviceWorker?.controller) return;
      let last = 0;
      try {
        last = Number(localStorage.getItem(WARMED_KEY) || 0);
      } catch {}
      if (!force && Date.now() - last < WARM_EVERY_MS) return;
      try {
        const res = await fetch("/api/offline/urls", { cache: "no-store" });
        const { urls } = (await res.json()) as { urls: string[] };
        post({ type: "WARM", urls });
        localStorage.setItem(WARMED_KEY, String(Date.now()));
      } catch {}
    },
    [userId],
  );

  const sync = useCallback(async () => {
    if (!userId || role !== "STUDENT" || syncing.current || !navigator.onLine) return;
    syncing.current = true;
    try {
      const result = await flushRuns(userId);
      if (result.synced.length) {
        setSynced((s) => [...s, ...result.synced]);
        router.refresh();
        warm(true);
      }
    } catch {
      /* try again on the next trigger */
    } finally {
      syncing.current = false;
      refreshPending();
    }
  }, [userId, role, router, warm, refreshPending]);

  // Service worker registration.
  useEffect(() => {
    if (!SW_ENABLED || !("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch(() => {});
    const onMessage = (e: MessageEvent) => {
      if (e.data?.type === "SYNCED") {
        setSynced((s) => [...s, ...(e.data.synced as Synced)]);
        router.refresh();
        refreshPending();
      }
    };
    navigator.serviceWorker.addEventListener("message", onMessage);
    // The first visit isn't controlled yet: warm the cache as soon as the worker takes over.
    const onController = () => warm(true);
    navigator.serviceWorker.addEventListener("controllerchange", onController);
    return () => {
      navigator.serviceWorker.removeEventListener("message", onMessage);
      navigator.serviceWorker.removeEventListener("controllerchange", onController);
    };
  }, [router, refreshPending, warm]);

  // A different (or no) user, or a new language: drop the cached pages and re-cache.
  useEffect(() => {
    const current = `${userId ?? ""}|${locale}`;
    let previous: string | null = null;
    try {
      previous = localStorage.getItem(USER_KEY);
      localStorage.setItem(USER_KEY, current);
    } catch {}
    const changed = previous !== null && previous !== current;
    if (changed) {
      post({ type: "CLEAR_USER_CACHE" });
      try {
        localStorage.removeItem(WARMED_KEY);
      } catch {}
    }
    warm(changed);
    refreshPending();
    sync();
  }, [userId, locale, warm, sync, refreshPending]);

  // Connectivity: banner, resync and cache refresh when back online.
  useEffect(() => {
    setOnline(navigator.onLine);
    const goOnline = () => {
      setOnline(true);
      sync();
      router.refresh();
    };
    const goOffline = () => setOnline(false);
    const onSyncRequest = () => {
      refreshPending();
      sync();
    };
    addEventListener("online", goOnline);
    addEventListener("offline", goOffline);
    addEventListener("ejs:sync", onSyncRequest);
    return () => {
      removeEventListener("online", goOnline);
      removeEventListener("offline", goOffline);
      removeEventListener("ejs:sync", onSyncRequest);
    };
  }, [sync, router, refreshPending]);

  // "Install the app" prompt (Chromium).
  useEffect(() => {
    const onPrompt = (e: Event) => {
      e.preventDefault();
      setInstall(e as InstallPrompt);
    };
    addEventListener("beforeinstallprompt", onPrompt);
    return () => removeEventListener("beforeinstallprompt", onPrompt);
  }, []);

  useEffect(() => {
    if (!synced.length) return;
    const timer = setTimeout(() => setSynced([]), 9000);
    return () => clearTimeout(timer);
  }, [synced]);

  if (!online) {
    return (
      <div className="net-banner" role="status">
        <span className="dot" />
        <span>{pending ? t("offlinePending", { count: pending }) : t("offline")}</span>
      </div>
    );
  }
  if (synced.length) {
    const last = synced[synced.length - 1];
    return (
      <div className="net-banner ok" role="status">
        <span className="dot" />
        <span>{t("synced", { count: synced.length })}</span>
        <Link href={`/attempts/${last.attemptId}`} onClick={() => setSynced([])}>
          {t("seeResult")}
        </Link>
      </div>
    );
  }
  if (pending) {
    return (
      <div className="net-banner" role="status">
        <span className="dot" />
        <span>{t("pending", { count: pending })}</span>
        <button className="btn btn-sm" onClick={sync}>{t("syncNow")}</button>
      </div>
    );
  }
  if (install) {
    return (
      <div className="net-banner ok">
        <span className="dot" />
        <span>{t("installText")}</span>
        <button
          className="btn btn-sm btn-bright"
          onClick={async () => {
            await install.prompt();
            setInstall(null);
          }}
        >
          {t("install")}
        </button>
        <button className="btn btn-sm" onClick={() => setInstall(null)} aria-label={t("dismiss")}>✕</button>
      </div>
    );
  }
  return null;
}
