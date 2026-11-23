/**
 * Antrean transaksi offline (IndexedDB). Setiap entri membawa
 * `client_request_id` yang sama dengan payload, jadi pengiriman ulang aman
 * (unique constraint di server).
 */

export type OfflineQueueKind = 'simple' | 'transfer';

export interface QueuedTransaction {
  /** Sama dengan clientRequestId payload — dipakai sebagai primary key. */
  id: string;
  kind: OfflineQueueKind;
  payload: Record<string, unknown>;
  createdAt: number;
  attempts: number;
  lastError?: string;
}

export interface FlushResult {
  sent: number;
  dropped: number;
  remaining: number;
}

const DB_NAME = 'money-tracker-offline';
const STORE = 'outbox';
const DB_VERSION = 1;
export const OFFLINE_QUEUE_EVENT = 'money:offline-queue-change';

function hasIndexedDb(): boolean {
  return typeof indexedDB !== 'undefined';
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: 'id' });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('IndexedDB tidak tersedia'));
  });
}

function requestToPromise<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('Operasi IndexedDB gagal'));
  });
}

export function isOffline(): boolean {
  return typeof navigator !== 'undefined' && navigator.onLine === false;
}

export function notifyQueueChange(): void {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new Event(OFFLINE_QUEUE_EVENT));
  }
}

export async function enqueueTransaction(
  entry: Omit<QueuedTransaction, 'createdAt' | 'attempts'>,
): Promise<boolean> {
  if (!hasIndexedDb()) return false;
  try {
    const db = await openDb();
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).put({ ...entry, createdAt: Date.now(), attempts: 0 });
    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error ?? new Error('Gagal menyimpan antrean'));
      tx.onabort = () => reject(tx.error ?? new Error('Gagal menyimpan antrean'));
    });
    db.close();
    notifyQueueChange();
    return true;
  } catch {
    return false;
  }
}

export async function listQueue(): Promise<QueuedTransaction[]> {
  if (!hasIndexedDb()) return [];
  try {
    const db = await openDb();
    const tx = db.transaction(STORE, 'readonly');
    const rows = await requestToPromise(
      tx.objectStore(STORE).getAll() as IDBRequest<QueuedTransaction[]>,
    );
    db.close();
    return rows.sort((a, b) => a.createdAt - b.createdAt);
  } catch {
    return [];
  }
}

export async function queueCount(): Promise<number> {
  return (await listQueue()).length;
}

async function removeItem(id: string): Promise<void> {
  const db = await openDb();
  const tx = db.transaction(STORE, 'readwrite');
  tx.objectStore(STORE).delete(id);
  await new Promise<void>((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error('Gagal menghapus antrean'));
    tx.onabort = () => reject(tx.error ?? new Error('Gagal menghapus antrean'));
  });
  db.close();
}

async function markFailed(id: string, message: string): Promise<void> {
  const db = await openDb();
  const tx = db.transaction(STORE, 'readwrite');
  const store = tx.objectStore(STORE);
  const row = (await requestToPromise(store.get(id) as IDBRequest<QueuedTransaction | undefined>)) ?? null;
  if (row) store.put({ ...row, attempts: row.attempts + 1, lastError: message });
  await new Promise<void>((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error('Gagal memperbarui antrean'));
    tx.onabort = () => reject(tx.error ?? new Error('Gagal memperbarui antrean'));
  });
  db.close();
}

/**
 * Kirim semua antrean berurutan. Error jaringan menghentikan proses (entri
 * tetap disimpan); error validasi 4xx membuang entri agar tidak mengulang
 * selamanya. 5xx dipertahankan untuk dicoba lagi nanti.
 */
export async function flushOfflineQueue(): Promise<FlushResult> {
  if (isOffline()) {
    return { sent: 0, dropped: 0, remaining: await queueCount() };
  }
  const items = await listQueue();
  let sent = 0;
  let dropped = 0;
  let remaining = items.length;

  for (const item of items) {
    try {
      const response = await fetch('/api/transactions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ kind: item.kind, payload: item.payload }),
      });
      if (response.ok) {
        const body = (await response.json().catch(() => null)) as { ok?: boolean } | null;
        if (body?.ok === false) {
          await removeItem(item.id);
          dropped += 1;
          remaining -= 1;
          continue;
        }
        await removeItem(item.id);
        sent += 1;
        remaining -= 1;
        continue;
      }
      if (response.status >= 400 && response.status < 500) {
        await removeItem(item.id);
        dropped += 1;
        remaining -= 1;
        continue;
      }
      await markFailed(item.id, `HTTP ${response.status}`);
      break;
    } catch (error) {
      await markFailed(item.id, error instanceof Error ? error.message : 'Gagal mengirim');
      break;
    }
  }

  notifyQueueChange();
  return { sent, dropped, remaining };
}
