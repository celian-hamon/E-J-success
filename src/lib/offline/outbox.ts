// Browser-side queue of quiz runs played offline, stored in IndexedDB so it survives
// reloads and can also be flushed by the service worker (Background Sync).
// Keep the DB/store names in sync with public/sw.js.
export const OUTBOX_DB = "ejs-offline";
export const OUTBOX_STORE = "outbox";
export const SYNC_TAG = "ejs-outbox";

export type OfflineAnswer = { questionId: string; choiceId: string | null; timeMs: number; claim?: boolean | null };
export type OfflineRun = {
  clientId: string;
  userId: string;
  quizId: string;
  quizTitle: string;
  attemptId: string | null;
  playedAt: string;
  answers: OfflineAnswer[];
};

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(OUTBOX_DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(OUTBOX_STORE, { keyPath: "clientId" });
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function tx<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await open();
  return new Promise((resolve, reject) => {
    const req = fn(db.transaction(OUTBOX_STORE, mode).objectStore(OUTBOX_STORE));
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function queueRun(run: OfflineRun) {
  await tx("readwrite", (s) => s.put(run));
  // Ask the service worker to sync as soon as the connection is back (Chromium only;
  // other browsers sync from the page when it sees the "online" event).
  try {
    const reg = await navigator.serviceWorker?.ready;
    await (reg as ServiceWorkerRegistration & { sync?: { register(tag: string): Promise<void> } })?.sync?.register(SYNC_TAG);
  } catch {
    /* page-side sync covers it */
  }
}

export async function listRuns(userId: string): Promise<OfflineRun[]> {
  const all = await tx<OfflineRun[]>("readonly", (s) => s.getAll() as IDBRequest<OfflineRun[]>);
  return all.filter((r) => r.userId === userId);
}

export async function removeRun(clientId: string) {
  await tx("readwrite", (s) => s.delete(clientId));
}

export type SyncResult = { synced: { quizTitle: string; attemptId: string; xpEarned?: number }[]; dropped: number };

/** Sends every queued run for this user. Runs that fail on the network stay queued. */
export async function flushRuns(userId: string): Promise<SyncResult> {
  const result: SyncResult = { synced: [], dropped: 0 };
  for (const run of await listRuns(userId)) {
    let res: Response;
    try {
      res = await fetch("/api/sync/attempts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(run),
        credentials: "same-origin",
      });
    } catch {
      break; // still offline
    }
    if (res.ok) {
      const data = await res.json();
      result.synced.push({ quizTitle: run.quizTitle, attemptId: data.attemptId, xpEarned: data.xpEarned });
      await removeRun(run.clientId);
    } else if (res.status === 410 || res.status === 400 || res.status === 403) {
      result.dropped++; // will never succeed
      await removeRun(run.clientId);
    } else if (res.status === 401) {
      break; // signed out: keep it for when they sign back in
    }
  }
  return result;
}
