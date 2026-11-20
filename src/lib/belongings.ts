import type { DateStr, Loan, Person, Warranty } from '../types';
import { addMonths, daysBetween } from './dates';

/** Übliche Garantiezeiten in Monaten (gesetzliche Gewährleistung in der EU: 24) */
export const WARRANTY_OPTIONS: { months: number; label: string }[] = [
  { months: 12, label: '1 Jahr' },
  { months: 24, label: '2 Jahre' },
  { months: 36, label: '3 Jahre' },
  { months: 60, label: '5 Jahre' },
];

/** So viele Tage vor dem Ende einer Garantie erinnert Daywerk */
export const WARRANTY_NOTICE_DAYS = 30;

/** Ende der Garantie: Kaufdatum plus Monate */
export function warrantyEnd(bought: DateStr, months: number): DateStr {
  return addMonths(bought, Math.max(0, Math.round(months)));
}

export type WarrantyState = 'laeuft' | 'bald' | 'abgelaufen';

export interface WarrantyStatus {
  state: WarrantyState;
  /** Tage bis zum Ende (negativ = schon vorbei) */
  daysLeft: number;
}

export function warrantyStatus(w: Pick<Warranty, 'until'>, on: DateStr): WarrantyStatus {
  const daysLeft = daysBetween(on, w.until);
  return { state: daysLeft < 0 ? 'abgelaufen' : daysLeft <= WARRANTY_NOTICE_DAYS ? 'bald' : 'laeuft', daysLeft };
}

/** „noch 3 Tage“, „noch 5 Wochen“, „noch 14 Monate“, „abgelaufen am …“ wird in der Oberfläche ergänzt */
export function leftLabel(days: number): string {
  if (days < 0) return 'abgelaufen';
  if (days === 0) return 'endet heute';
  if (days === 1) return 'noch 1 Tag';
  if (days < 42) return `noch ${days} Tage`;
  if (days < 365) return `noch ${Math.round(days / 30.4)} Monate`;
  const months = Math.round(days / 30.4);
  return months % 12 === 0 ? `noch ${months / 12} ${months === 12 ? 'Jahr' : 'Jahre'}` : `noch ${months} Monate`;
}

/** Laufende Garantien zuerst (die bald endenden oben), abgelaufene danach (die jüngsten oben) */
export function sortWarranties(list: Warranty[], on: DateStr): { running: Warranty[]; expired: Warranty[] } {
  const running = list.filter((w) => w.until >= on).sort((a, b) => a.until.localeCompare(b.until));
  const expired = list.filter((w) => w.until < on).sort((a, b) => b.until.localeCompare(a.until));
  return { running, expired };
}

/** Name der Person zu einer Leihe */
export function loanWho(l: Pick<Loan, 'personId' | 'who'>, people: Pick<Person, 'id' | 'name'>[]): string {
  return (l.personId && people.find((p) => p.id === l.personId)?.name) || l.who.trim() || 'jemand';
}

export type LoanState = 'zurueck' | 'ueberfaellig' | 'faellig' | 'offen';

export interface LoanStatus {
  state: LoanState;
  /** Tage bis zur Frist (null ohne Frist) */
  daysLeft: number | null;
}

export function loanStatus(l: Pick<Loan, 'due' | 'returned'>, on: DateStr): LoanStatus {
  if (l.returned) return { state: 'zurueck', daysLeft: null };
  if (!l.due) return { state: 'offen', daysLeft: null };
  const daysLeft = daysBetween(on, l.due);
  return { state: daysLeft < 0 ? 'ueberfaellig' : daysLeft <= 3 ? 'faellig' : 'offen', daysLeft };
}

/** Offene Leihen: überfällige zuerst, dann nach Frist, dann die ältesten */
export function openLoans(loans: Loan[]): Loan[] {
  return loans
    .filter((l) => !l.returned)
    .sort((a, b) => (a.due ?? '9999').localeCompare(b.due ?? '9999') || a.date.localeCompare(b.date));
}

/** Satz für eine Leihe: „Lea hat dein Buch“ bzw. „Du hast Max' Taschenrechner“ */
export function loanSentence(l: Pick<Loan, 'direction' | 'title' | 'personId' | 'who'>, people: Pick<Person, 'id' | 'name'>[]): string {
  const who = loanWho(l, people);
  return l.direction === 'verliehen' ? `${l.title} ist bei ${who}` : `${l.title} von ${who}`;
}

/** Kurzer Hinweis für die Bereiche-Kachel, z. B. „2 verliehen“ oder „Kopfhörer: Garantie noch 12 Tage“ */
export function belongingsHint(loans: Loan[], warranties: Warranty[], on: DateStr): string {
  const late = loans.filter((l) => loanStatus(l, on).state === 'ueberfaellig').length;
  if (late) return `${late} überfällig zurück`;
  const soon = sortWarranties(warranties, on).running.find((w) => warrantyStatus(w, on).state === 'bald');
  if (soon) return `${soon.title}: Garantie ${leftLabel(warrantyStatus(soon, on).daysLeft)}`;
  const out = loans.filter((l) => !l.returned && l.direction === 'verliehen').length;
  const borrowed = loans.filter((l) => !l.returned && l.direction === 'geliehen').length;
  const parts = [out ? `${out} verliehen` : '', borrowed ? `${borrowed} geliehen` : ''].filter(Boolean);
  if (parts.length) return parts.join(' · ');
  const running = warranties.filter((w) => w.until >= on).length;
  return running ? `${running} ${running === 1 ? 'Garantie' : 'Garantien'}` : '';
}
