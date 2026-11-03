/**
 * Knubbel, das Tamagotchi – gleiche Regeln wie im iOS-Widget
 * (ios/App/AntonOSWidgets/HaustierWidget.swift, `TierLaune.aus`). Grenzen dort mitändern.
 * Zeiten in ms seit 1970.
 */

export interface PetState {
  /** Geschlüpft */
  born: number;
  /** Letzte Mahlzeit */
  fed: number;
  meals: number;
}

export type PetMood = 'essen' | 'party' | 'froh' | 'normal' | 'hunger' | 'traurig' | 'krank' | 'tot' | 'schlaf';

const MIN = 60_000;
const HOUR = 60 * MIN;

export const PET_LIMITS = {
  eatEnd: 1 * MIN,
  partyEnd: 5 * MIN,
  frohEnd: 3 * HOUR,
  normalEnd: 8 * HOUR,
  hungerEnd: 16 * HOUR,
  sickStart: 24 * HOUR,
  deathAfter: 48 * HOUR,
} as const;

/** Schriftname (CSS) und Text je Laune */
export const PET_MOODS: Record<PetMood, { font: string; text: string; color: string }> = {
  essen: { font: 'AntonTierEssen', text: 'Mampf, mampf!', color: '#FF3B30' },
  party: { font: 'AntonTierParty', text: 'Danke! Knubbel ist satt', color: '#FF2D55' },
  froh: { font: 'AntonTierFroh', text: 'Knubbel ist gut gelaunt', color: '#FF9500' },
  normal: { font: 'AntonTierNormal', text: 'Knubbel bummelt herum', color: '#30B0C7' },
  hunger: { font: 'AntonTierHunger', text: 'Knubbel hat Hunger', color: '#A2845E' },
  traurig: { font: 'AntonTierTraurig', text: 'Knubbel ist sehr hungrig', color: '#5856D6' },
  krank: { font: 'AntonTierKrank', text: 'Knubbel ist krank! Füttern hilft', color: '#34C759' },
  tot: { font: 'AntonTierTot', text: 'Knubbel ist gestorben', color: '#8E8E93' },
  schlaf: { font: 'AntonTierSchlaf', text: 'Knubbel schläft', color: '#AF52DE' },
};

/** Neues Ei; wie im Widget gilt Knubbel anfangs als vor einer Stunde gefüttert */
export function hatchPet(now: number): PetState {
  return { born: now, fed: now - HOUR, meals: 0 };
}

export function feedPet(state: PetState, now: number): PetState {
  return { ...state, fed: now, meals: state.meals + 1 };
}

export function petMood(state: PetState, now: Date): PetMood {
  const since = now.getTime() - state.fed;
  if (since < PET_LIMITS.eatEnd) return 'essen';
  if (since < PET_LIMITS.partyEnd) return 'party';
  if (since >= PET_LIMITS.deathAfter) return 'tot';
  if (since >= PET_LIMITS.sickStart) return 'krank';
  const hour = now.getHours();
  if (hour >= 23 || hour < 6) return 'schlaf';
  if (since < PET_LIMITS.frohEnd) return 'froh';
  if (since < PET_LIMITS.normalEnd) return 'normal';
  if (since < PET_LIMITS.hungerEnd) return 'hunger';
  return 'traurig';
}

/** 1 direkt nach dem Essen, 0 nach 16 Stunden */
export function petFullness(state: PetState, now: number): number {
  return Math.max(0, Math.min(1, 1 - (now - state.fed) / PET_LIMITS.hungerEnd));
}

export const petDeathAt = (state: PetState): number => state.fed + PET_LIMITS.deathAfter;

/** Alter bis jetzt bzw. bis zum Tod: „5 Std.“, „1 Tag“, „3 Tage“ */
export function petAge(state: PetState, now: number): string {
  const end = now - state.fed >= PET_LIMITS.deathAfter ? petDeathAt(state) : now;
  const hours = Math.max(0, Math.floor((end - state.born) / HOUR));
  if (hours < 24) return `${hours} Std.`;
  const days = Math.floor(hours / 24);
  return days === 1 ? '1 Tag' : `${days} Tage`;
}

/** Restzeit als „H:MM:SS“ */
export function countdown(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  const two = (n: number) => String(n).padStart(2, '0');
  return `${Math.floor(s / 3600)}:${two(Math.floor(s / 60) % 60)}:${two(s % 60)}`;
}

/** Bild der Sekunden-Schrift: die Sekunden als zwei Ziffern („00“–„59“) */
export const petFrame = (now: Date): string => String(now.getSeconds()).padStart(2, '0');

/** Gespeicherten Zustand prüfen (fremde oder alte Daten) */
export function parsePet(raw: unknown): PetState | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : null);
  const born = num(r.born);
  const fed = num(r.fed);
  if (born === null || fed === null) return null;
  return { born, fed, meals: Math.max(0, Math.floor(num(r.meals) ?? 0)) };
}
