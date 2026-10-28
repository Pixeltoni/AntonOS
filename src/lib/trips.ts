import type { DateStr, PackItem, PackTemplate, Transaction, Trip, TripLeg, TripLegKind } from '../types';
import { daysBetween } from './dates';

export const LEG_KINDS: Record<TripLegKind, { label: string; color: string }> = {
  flug: { label: 'Flug', color: '#0A84FF' },
  zug: { label: 'Zug', color: '#34C759' },
  bus: { label: 'Bus', color: '#30B0C7' },
  auto: { label: 'Auto', color: '#8E8E93' },
  unterkunft: { label: 'Unterkunft', color: '#FF9500' },
  sonstiges: { label: 'Sonstiges', color: '#AF52DE' },
};

/** Fertige Packlisten zum Übernehmen */
export const PACK_TEMPLATES: PackTemplate[] = [
  {
    name: 'Wochenende',
    items: [
      ['Personalausweis', 'Dokumente'], ['Tickets aufs Handy', 'Dokumente'], ['Geldbeutel & Karte', 'Dokumente'],
      ['Unterwäsche & Socken', 'Kleidung'], ['T-Shirts', 'Kleidung'], ['Pullover', 'Kleidung'], ['Schlafsachen', 'Kleidung'],
      ['Zahnbürste & Zahnpasta', 'Hygiene'], ['Duschgel & Deo', 'Hygiene'],
      ['Ladekabel', 'Technik'], ['Kopfhörer', 'Technik'],
    ].map(([title, section]) => ({ title, section })),
  },
  {
    name: 'Städtetrip',
    items: [
      ['Personalausweis', 'Dokumente'], ['Bordkarte / Tickets aufs Handy', 'Dokumente'], ['Geldbeutel & Karte', 'Dokumente'], ['Krankenversicherungskarte', 'Dokumente'],
      ['Bequeme Schuhe', 'Kleidung'], ['Regenjacke', 'Kleidung'], ['Unterwäsche & Socken', 'Kleidung'], ['T-Shirts', 'Kleidung'], ['Hose', 'Kleidung'],
      ['Zahnbürste & Zahnpasta', 'Hygiene'], ['Duschgel & Deo', 'Hygiene'], ['Medikamente', 'Hygiene'],
      ['Ladekabel & Powerbank', 'Technik'], ['Kopfhörer', 'Technik'], ['Reiseadapter', 'Technik'],
      ['Rucksack für den Tag', 'Sonstiges'], ['Trinkflasche', 'Sonstiges'],
    ].map(([title, section]) => ({ title, section })),
  },
  {
    name: 'Strandurlaub',
    items: [
      ['Personalausweis / Reisepass', 'Dokumente'], ['Tickets', 'Dokumente'], ['Auslandskrankenversicherung', 'Dokumente'],
      ['Badesachen', 'Kleidung'], ['Sonnenbrille', 'Kleidung'], ['Sandalen', 'Kleidung'], ['Leichte Kleidung', 'Kleidung'], ['Sonnenhut', 'Kleidung'],
      ['Sonnencreme', 'Hygiene'], ['After-Sun', 'Hygiene'], ['Zahnbürste & Zahnpasta', 'Hygiene'], ['Medikamente', 'Hygiene'],
      ['Ladekabel & Powerbank', 'Technik'], ['Kopfhörer', 'Technik'],
      ['Strandtuch', 'Sonstiges'], ['Buch', 'Sonstiges'],
    ].map(([title, section]) => ({ title, section })),
  },
  {
    name: 'Skiurlaub',
    items: [
      ['Personalausweis', 'Dokumente'], ['Skipass / Buchung', 'Dokumente'],
      ['Skijacke & -hose', 'Kleidung'], ['Thermounterwäsche', 'Kleidung'], ['Skisocken', 'Kleidung'], ['Handschuhe', 'Kleidung'], ['Mütze & Schal', 'Kleidung'], ['Skibrille', 'Kleidung'],
      ['Sonnencreme & Lippenpflege', 'Hygiene'], ['Zahnbürste & Zahnpasta', 'Hygiene'],
      ['Ladekabel & Powerbank', 'Technik'],
      ['Helm', 'Ausrüstung'], ['Ski / Board oder Leihbuchung', 'Ausrüstung'],
    ].map(([title, section]) => ({ title, section })),
  },
];

/** Reihenfolge der Abschnitte in der Packliste */
const SECTION_ORDER = ['Dokumente', 'Kleidung', 'Hygiene', 'Technik', 'Ausrüstung', 'Sonstiges'];

/** Vorlage in die Packliste übernehmen – was schon draufsteht, kommt nicht doppelt. */
export function applyTemplate(packing: PackItem[], template: PackTemplate, newId: () => string): PackItem[] {
  const have = new Set(packing.map((p) => p.title.trim().toLowerCase()));
  const added = template.items.filter((i) => !have.has(i.title.trim().toLowerCase())).map((i) => ({ id: newId(), title: i.title, section: i.section || 'Sonstiges', done: false }));
  return [...packing, ...added];
}

/** Packliste nach Abschnitten, bekannte Abschnitte in fester Reihenfolge, eigene dahinter */
export function packSections(packing: PackItem[]): { section: string; items: PackItem[] }[] {
  const names = [...new Set(packing.map((p) => p.section || 'Sonstiges'))].sort((a, b) => {
    const ia = SECTION_ORDER.indexOf(a);
    const ib = SECTION_ORDER.indexOf(b);
    return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib) || a.localeCompare(b);
  });
  return names.map((section) => ({ section, items: packing.filter((p) => (p.section || 'Sonstiges') === section) }));
}

export const packProgress = (packing: PackItem[]) => ({ done: packing.filter((p) => p.done).length, total: packing.length });

export type TripPhase = 'bald' | 'unterwegs' | 'vorbei';

/** Vor, während oder nach der Reise – mit Tagen bis zum Start bzw. seit dem Ende */
export function tripPhase(trip: Pick<Trip, 'start' | 'end'>, on: DateStr): { phase: TripPhase; days: number } {
  if (on < trip.start) return { phase: 'bald', days: daysBetween(on, trip.start) };
  if (on <= trip.end) return { phase: 'unterwegs', days: daysBetween(trip.start, on) + 1 };
  return { phase: 'vorbei', days: daysBetween(trip.end, on) };
}

/** Reisetage einschließlich An- und Abreisetag */
export const tripDays = (trip: Pick<Trip, 'start' | 'end'>) => Math.max(1, daysBetween(trip.start, trip.end) + 1);

export interface TripBudget {
  spent: number;
  left: number;
  /** Rest pro verbleibendem Reisetag (vor der Reise: pro Reisetag) */
  perDay: number;
}

export function tripBudget(trip: Trip, txs: Pick<Transaction, 'tripId' | 'type' | 'amount'>[], on: DateStr): TripBudget {
  const spent = Math.round(txs.filter((t) => t.tripId === trip.id && t.type === 'Ausgabe').reduce((s, t) => s + t.amount, 0) * 100) / 100;
  const left = Math.round((trip.budget - spent) * 100) / 100;
  const { phase } = tripPhase(trip, on);
  const days = phase === 'unterwegs' ? daysBetween(on, trip.end) + 1 : phase === 'bald' ? tripDays(trip) : 0;
  return { spent, left, perDay: days > 0 ? Math.round((left / days) * 100) / 100 : 0 };
}

/** Etappen nach Datum und Uhrzeit */
export function sortLegs(legs: TripLeg[]): TripLeg[] {
  return [...legs].sort((a, b) => a.date.localeCompare(b.date) || (a.time || '99').localeCompare(b.time || '99'));
}

/** Nächste anstehende Reise (läuft gerade oder beginnt als Nächstes) */
export function nextTrip(trips: Trip[], on: DateStr): Trip | null {
  return [...trips].filter((t) => t.end >= on).sort((a, b) => a.start.localeCompare(b.start))[0] ?? null;
}
