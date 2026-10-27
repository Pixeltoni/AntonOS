import { createClient } from '@supabase/supabase-js';

/**
 * Supabase-Projekt für die Synchronisierung. Adresse und Publishable Key sind
 * öffentlich und dürfen im Code stehen: Zugriff auf Daten gibt es nur nach dem
 * Login, und die Datenbank lässt jedes Konto nur seine eigenen Daten sehen (RLS).
 */
export const SUPABASE_URL = 'https://nvbavfkkzipphcxoujhz.supabase.co';
export const SUPABASE_KEY = 'sb_publishable_l3rkg588KOfoGH_SQMSwfA_waP0u23E';

export const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: { flowType: 'pkce', persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, storageKey: 'antonos:auth' },
});

/* ---------- Abgleich zwischen Gerät und Cloud ---------- */

export interface SyncMeta {
  /** Konto, mit dem dieses Gerät zuletzt abgeglichen hat */
  userId: string | null;
  /** Server-Zeitstempel des zuletzt abgeglichenen Stands */
  lastSynced: string | null;
  /** Lokale Änderungen, die noch nicht in der Cloud sind */
  dirty: boolean;
}

export type SyncDecision = 'hochladen' | 'herunterladen' | 'konflikt' | 'nichts';

/**
 * Entscheidet, was beim Abgleich passieren muss.
 * - Cloud leer: hochladen
 * - Cloud unverändert seit dem letzten Abgleich: lokale Änderungen hochladen (falls vorhanden)
 * - Cloud wurde woanders geändert: herunterladen – oder nachfragen, wenn es hier auch Änderungen gibt
 */
export function decide(remoteUpdatedAt: string | null, meta: SyncMeta, userId: string): SyncDecision {
  if (remoteUpdatedAt === null) return 'hochladen';
  const sameAccount = meta.userId === userId;
  const lastSynced = sameAccount ? meta.lastSynced : null;
  // Neues Gerät ohne eigene Einträge: einfach die Cloud übernehmen.
  // Daten eines anderen Kontos gelten immer als abweichend.
  const dirty = sameAccount || meta.userId === null ? meta.dirty : true;
  if (lastSynced !== null && sameTime(remoteUpdatedAt, lastSynced)) return dirty ? 'hochladen' : 'nichts';
  return dirty ? 'konflikt' : 'herunterladen';
}

export function sameTime(a: string, b: string): boolean {
  return new Date(a).getTime() === new Date(b).getTime();
}

const META_KEY = 'antonos:sync';

export function loadMeta(): SyncMeta {
  try {
    const raw = localStorage.getItem(META_KEY);
    if (raw) return { userId: null, lastSynced: null, dirty: false, ...(JSON.parse(raw) as Partial<SyncMeta>) };
  } catch {
    // ohne Speicher gilt: noch nie abgeglichen
  }
  return { userId: null, lastSynced: null, dirty: false };
}

export function saveMeta(meta: SyncMeta) {
  try {
    localStorage.setItem(META_KEY, JSON.stringify(meta));
  } catch {
    // nicht kritisch – beim nächsten Start wird erneut abgeglichen
  }
}
