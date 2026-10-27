import type { NavItem, WidgetArea, WidgetConfig, WidgetId } from '../types';

export const AREAS: { area: WidgetArea; label: string }[] = [
  { area: 'oben', label: 'Oben (volle Breite)' },
  { area: 'links', label: 'Linke Spalte' },
  { area: 'mitte', label: 'Mittlere Spalte' },
  { area: 'rechts', label: 'Rechte Spalte' },
  { area: 'unten', label: 'Unten (volle Breite)' },
];

export const WIDGET_LABELS: Record<WidgetId, string> = {
  topnav: '🧭 Bereichsleiste',
  stats: '📈 Kennzahlen',
  clock: '🕰️ Uhr',
  quick: '⚡ Schnellaktionen',
  notes: '📝 Letzte Notizen',
  music: '🎵 Musik (Spotify)',
  tools: '🧰 Nützliche Tools',
  tasks: '✅ Aufgaben diese Woche',
  projects: '🚀 Aktive Projekte',
  transactions: '💸 Letzte Buchungen',
  watching: '📺 Gerade am Schauen',
  reading: '📖 Gerade am Lesen',
  habits: '✨ Gewohnheiten heute',
  period: '⏳ Fortschritt',
  exams: '📅 Anstehende Prüfungen',
  trainings: '🏋️ Letzte Trainings',
  calendar: '🗓️ Monatskalender',
  courses: '📚 Kurse',
  albums: '📸 Letzte Alben',
  vision: '🌄 Vision Board',
};

export const DEFAULT_DASHBOARD: WidgetConfig[] = (
  [
    ['topnav', 'oben'], ['stats', 'oben'],
    ['clock', 'links'], ['quick', 'links'], ['notes', 'links'], ['music', 'links'], ['tools', 'links'],
    ['tasks', 'mitte'], ['projects', 'mitte'], ['transactions', 'mitte'], ['watching', 'mitte'], ['reading', 'mitte'],
    ['habits', 'rechts'], ['period', 'rechts'], ['exams', 'rechts'], ['trainings', 'rechts'],
    ['calendar', 'unten'], ['courses', 'unten'], ['albums', 'unten'], ['vision', 'unten'],
  ] as [WidgetId, WidgetArea][]
).map(([id, area]) => ({ id, area, hidden: false }));

export const DEFAULT_SIDEBAR: NavItem[] = (
  [
    ['dashboard', 'Dashboard', '🏠', ''], ['kalender', 'Kalender', '🗓️', ''], ['musik', 'Musik', '🎵', ''],
    ['kurse', 'Kurse', '📚', 'Studium'], ['aufgaben', 'Aufgaben', '✅', 'Studium'], ['notizen', 'Notizen', '📝', 'Studium'],
    ['lernen', 'Lernkarten', '🧠', 'Studium'], ['pruefungen', 'Prüfungen', '📅', 'Studium'], ['noten', 'Noten', '📊', 'Studium'],
    ['fokus', 'Fokus', '⏱️', 'Studium'],
    ['projekte', 'Projekte', '🚀', 'Leben'], ['gewohnheiten', 'Gewohnheiten', '✨', 'Leben'], ['ziele', 'Ziele', '🎯', 'Leben'],
    ['finanzen', 'Finanzen', '💰', 'Leben'], ['training', 'Training', '🏋️', 'Leben'],
    ['schauen', 'Watchlist', '📺', 'Sammlungen'], ['lesen', 'Leseliste', '📖', 'Sammlungen'], ['alben', 'Alben', '📸', 'Sammlungen'],
    ['tools', 'Tools', '🧰', 'Sammlungen'],
    ['einstellungen', 'Einstellungen', '⚙️', ''],
  ] as [string, string, string, string][]
).map(([path, label, icon, group]) => ({ path, label, icon, group, hidden: false }));

/**
 * Übernimmt die gespeicherte Anpassung, verwirft unbekannte Einträge und hängt
 * neue Standard-Einträge (z. B. nach einem Update) hinten an.
 */
export function mergeWithDefaults<T, K extends keyof T>(stored: T[] | undefined, defaults: T[], key: K): T[] {
  if (!Array.isArray(stored) || stored.length === 0) return defaults;
  const known = new Set(defaults.map((d) => d[key]));
  const seen = new Set<T[K]>();
  const kept = stored.filter((s) => {
    if (!known.has(s[key]) || seen.has(s[key])) return false;
    seen.add(s[key]);
    return true;
  });
  return [...kept, ...defaults.filter((d) => !seen.has(d[key]))];
}

/** Verschiebt ein Widget innerhalb seines Bereichs um eine Position nach oben (-1) oder unten (+1). */
export function moveWidget(list: WidgetConfig[], id: WidgetId, dir: -1 | 1): WidgetConfig[] {
  const i = list.findIndex((w) => w.id === id);
  if (i < 0) return list;
  let j = i + dir;
  while (j >= 0 && j < list.length && list[j].area !== list[i].area) j += dir;
  if (j < 0 || j >= list.length) return list;
  const next = [...list];
  [next[i], next[j]] = [next[j], next[i]];
  return next;
}

/** Verschiebt einen Sidebar-Eintrag um eine Position. */
export function moveItem<T>(list: T[], index: number, dir: -1 | 1): T[] {
  const j = index + dir;
  if (j < 0 || j >= list.length) return list;
  const next = [...list];
  [next[index], next[j]] = [next[j], next[index]];
  return next;
}

/** Fasst aufeinanderfolgende Einträge mit gleicher Gruppe zu Abschnitten zusammen. */
export function groupNav(items: NavItem[]): { group: string; items: NavItem[] }[] {
  const sections: { group: string; items: NavItem[] }[] = [];
  for (const item of items) {
    const last = sections[sections.length - 1];
    if (last && last.group === item.group) last.items.push(item);
    else sections.push({ group: item.group, items: [item] });
  }
  return sections;
}
