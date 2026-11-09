import type { SaveSlot } from '../shared/types';
import { validateAndMigrate } from '../management/club';

const DB_NAME = 'fps-soccer-db';
const STORE = 'career-slots';

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (!('indexedDB' in globalThis)) { reject(new Error('IndexedDB mavjud emas.')); return; }
    const request = indexedDB.open(DB_NAME, 2);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE, { keyPath: 'slotId' });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('Ma’lumotlar ombori ochilmadi.'));
  });
}

export async function saveSlot(slotId: string, slot: SaveSlot): Promise<void> {
  const safe = { ...slot, version: 2, updatedAt: Date.now() };
  try {
    const db = await openDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).put({ slotId, data: safe, updatedAt: safe.updatedAt });
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error ?? new Error('Saqlash muvaffaqiyatsiz.'));
      tx.onabort = () => reject(tx.error ?? new Error('Saqlash bekor qilindi.'));
    });
    db.close();
  } catch (error) {
    try { localStorage.setItem(`fps-soccer:${slotId}`, JSON.stringify(safe)); }
    catch { throw new Error(`Saqlash xatosi: ${error instanceof Error ? error.message : 'noma’lum xato'}`); }
  }
}

export async function loadSlot(slotId: string): Promise<SaveSlot | null> {
  try {
    const db = await openDb();
    const raw = await new Promise<unknown>((resolve, reject) => {
      const request = db.transaction(STORE, 'readonly').objectStore(STORE).get(slotId);
      request.onsuccess = () => resolve(request.result?.data ?? null);
      request.onerror = () => reject(request.error);
    });
    db.close();
    if (raw) return validateAndMigrate(raw);
  } catch { /* local fallback below */ }
  const fallback = localStorage.getItem(`fps-soccer:${slotId}`);
  return fallback ? validateAndMigrate(JSON.parse(fallback)) : null;
}

export async function deleteSlot(slotId: string): Promise<void> {
  try {
    const db = await openDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).delete(slotId);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    db.close();
  } finally { localStorage.removeItem(`fps-soccer:${slotId}`); }
}
