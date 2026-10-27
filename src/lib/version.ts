/**
 * Datenformat-Version. Erhöhen, sobald eine neue Version Bereiche hinzufügt,
 * die ältere Versionen nicht kennen (z. B. 2 = Kalendertermine, 3 = Daueraufträge und Spartöpfe, 4 = Einkaufsliste).
 */
export const SCHEMA_VERSION = 4;

/** Build-Kennung, wird beim Bauen gesetzt (siehe vite.config.ts). */
export const APP_VERSION: string = typeof __APP_VERSION__ === 'string' ? __APP_VERSION__ : 'dev';

/** Wurde der Cloud-Stand von einer neueren AntonOS-Version gespeichert? */
export function isNewerSchema(remote: unknown): boolean {
  if (!remote || typeof remote !== 'object') return false;
  const v = (remote as { schemaVersion?: unknown }).schemaVersion;
  return typeof v === 'number' && v > SCHEMA_VERSION;
}
