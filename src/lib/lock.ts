import type { LockSettings } from '../types';

/** Seiten, die sich mit Face ID sperren lassen */
export const LOCKABLE: { path: string; label: string }[] = [
  { path: 'finanzen', label: 'Finanzen' },
  { path: 'abos', label: 'Abos & Verträge' },
  { path: 'rueckblick', label: 'Rückblick & Stimmung' },
  { path: 'notizen', label: 'Notizen' },
  { path: 'menschen', label: 'Menschen' },
];

export const defaultLock = (): LockSettings => ({ enabled: false, pages: ['finanzen', 'abos', 'rueckblick'] });

/** Ist diese Seite gesperrt (solange nicht entsperrt)? */
export const isLockedPage = (lock: LockSettings | undefined, page: string) => !!lock?.enabled && lock.pages.includes(page);

/** Nach so langer Zeit im Hintergrund wird wieder gesperrt */
export const RELOCK_MS = 60_000;
