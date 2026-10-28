import type { NavItem, WidgetConfig, WidgetHeight, WidgetId, WidgetSize, WidgetVariant } from '../types';

export const SIZES: { size: WidgetSize; label: string; span: number }[] = [
  { size: 's', label: 'Klein (¼)', span: 3 },
  { size: 'm', label: 'Mittel (⅓)', span: 4 },
  { size: 'l', label: 'Groß (½)', span: 6 },
  { size: 'xl', label: 'Breit (⅔)', span: 8 },
  { size: 'full', label: 'Ganze Breite', span: 12 },
];

export const HEIGHTS: { height: WidgetHeight; label: string }[] = [
  { height: 'auto', label: 'Höhe: automatisch' },
  { height: 's', label: 'Höhe: niedrig' },
  { height: 'm', label: 'Höhe: mittel' },
  { height: 'l', label: 'Höhe: hoch' },
];

export const VARIANT_LABELS: Record<WidgetVariant, string> = {
  kompakt: 'Kompakt (weniger Infos)',
  standard: 'Standard',
  detail: 'Detail (mehr Infos)',
};

export const WIDGET_LABELS: Record<WidgetId, string> = {
  topnav: '🧭 Bereichsleiste',
  stats: '📈 Kennzahlen',
  clock: '🕰️ Uhr',
  quick: '⚡ Schnellaktionen',
  notes: '📝 Letzte Notizen',
  music: '🎵 Musik (Spotify)',
  tools: '🧰 Nützliche Tools',
  tasks: '✅ Aufgaben',
  projects: '🚀 Aktive Projekte',
  transactions: '💸 Letzte Buchungen',
  budget: '💳 Budget',
  stack: '🗂️ Smart Stack',
  today: '📆 Heute',
  countdown: '⏳ Countdown',
  shopping: '🛒 Einkaufsliste',
  review: '🌟 Rückblick & Stimmung',
  watching: '📺 Gerade am Schauen',
  reading: '📖 Gerade am Lesen',
  habits: '✨ Gewohnheiten heute',
  rings: '⭕ Aktivitätsringe',
  focus: '⏱️ Fokus-Timer',
  period: '⏳ Fortschritt',
  exams: '📅 Anstehende Prüfungen',
  trainings: '🏋️ Letzte Trainings',
  calendar: '🗓️ Kalender',
  courses: '📚 Kurse',
  albums: '📸 Letzte Alben',
  vision: '🌄 Vision Board',
};

const w = (id: WidgetId, size: WidgetSize, variant: WidgetVariant = 'standard', hidden = false): WidgetConfig => ({
  id, size, height: 'auto', variant, hidden,
});

/** Standard-Layout, angelehnt an Life Planner OS: schmale Spalten außen, breite Mitte. */
export const DEFAULT_DASHBOARD: WidgetConfig[] = [
  w('topnav', 'full'),
  w('stats', 'full'),
  w('clock', 's'),
  w('stack', 's'),
  w('today', 's', 'standard', true),
  w('countdown', 's', 'standard', true),
  w('tasks', 'l'),
  w('review', 's'),
  w('rings', 's'),
  w('focus', 's'),
  w('habits', 's'),
  w('quick', 's'),
  w('period', 's'),
  w('projects', 'l'),
  w('exams', 's'),
  w('notes', 's'),
  w('budget', 's'),
  w('transactions', 'l'),
  w('shopping', 's'),
  w('trainings', 's'),
  w('music', 's'),
  w('watching', 'm'),
  w('reading', 'm'),
  w('tools', 's'),
  w('calendar', 'full'),
  w('courses', 'full'),
  w('albums', 'full'),
  w('vision', 'full'),
];

/** Altes Format (Bereiche oben/links/mitte/rechts/unten) in Größen übersetzen. */
const AREA_SIZE: Record<string, WidgetSize> = { oben: 'full', links: 's', mitte: 'l', rechts: 's', unten: 'full' };
const AREA_ORDER = ['oben', 'links', 'mitte', 'rechts', 'unten'];

/** Ergänzt fehlende Felder und übernimmt Anpassungen aus älteren Versionen. */
export function normalizeWidgets(stored: unknown): WidgetConfig[] {
  if (!Array.isArray(stored) || stored.length === 0) return [];
  const items = stored as (Partial<WidgetConfig> & { area?: string })[];
  const legacy = items.some((x) => x.area && !x.size);
  const sorted = legacy ? [...items].sort((a, b) => AREA_ORDER.indexOf(a.area ?? '') - AREA_ORDER.indexOf(b.area ?? '')) : items;
  return sorted
    .filter((x): x is Partial<WidgetConfig> & { id: WidgetId; area?: string } => typeof x.id === 'string')
    .map((x) => ({
      id: x.id,
      size: x.size ?? AREA_SIZE[x.area ?? ''] ?? 'm',
      height: x.height ?? 'auto',
      variant: x.variant ?? 'standard',
      hidden: !!x.hidden,
    }));
}

/**
 * Sidebar als Life-Organizer: Start, Leben, Geld, Studium, Freizeit.
 * `icon` leer = einheitliches Linien-Symbol; ein Emoji dort ersetzt es (eigene Wahl).
 */
export const DEFAULT_SIDEBAR: NavItem[] = (
  [
    ['dashboard', 'Übersicht', 'Start'], ['kalender', 'Kalender', 'Start'], ['aufgaben', 'Aufgaben', 'Start'], ['notizen', 'Notizen', 'Start'],
    ['gewohnheiten', 'Gewohnheiten', 'Leben'], ['rueckblick', 'Rückblick', 'Leben'], ['ziele', 'Ziele', 'Leben'], ['projekte', 'Projekte', 'Leben'],
    ['training', 'Training', 'Leben'],
    ['finanzen', 'Finanzen', 'Geld'], ['einkauf', 'Einkaufsliste', 'Geld'],
    ['kurse', 'Kurse', 'Studium'], ['lernen', 'Lernkarten', 'Studium'], ['pruefungen', 'Prüfungen', 'Studium'], ['noten', 'Noten', 'Studium'],
    ['fokus', 'Fokus', 'Studium'],
    ['musik', 'Musik', 'Freizeit'], ['schauen', 'Watchlist', 'Freizeit'], ['lesen', 'Leseliste', 'Freizeit'], ['alben', 'Alben', 'Freizeit'],
    ['tools', 'Tools', ''], ['einstellungen', 'Einstellungen', ''],
  ] as [string, string, string][]
).map(([path, label, group]) => ({ path, label, icon: '', group, hidden: false }));

/** Sidebar-Version: 2 = Life-Organizer-Gruppen mit Linien-Symbolen */
export const SIDEBAR_LAYOUT = 2;

/** Namen und Emojis der ersten Sidebar – um eigene Anpassungen davon zu unterscheiden */
const OLD_SIDEBAR: Record<string, [string, string]> = {
  dashboard: ['Dashboard', '🏠'], kalender: ['Kalender', '🗓️'], musik: ['Musik', '🎵'], kurse: ['Kurse', '📚'], aufgaben: ['Aufgaben', '✅'],
  notizen: ['Notizen', '📝'], lernen: ['Lernkarten', '🧠'], pruefungen: ['Prüfungen', '📅'], noten: ['Noten', '📊'], fokus: ['Fokus', '⏱️'],
  projekte: ['Projekte', '🚀'], gewohnheiten: ['Gewohnheiten', '✨'], rueckblick: ['Rückblick', '🌟'], ziele: ['Ziele', '🎯'],
  finanzen: ['Finanzen', '💰'], einkauf: ['Einkaufsliste', '🛒'], training: ['Training', '🏋️'], schauen: ['Watchlist', '📺'],
  lesen: ['Leseliste', '📖'], alben: ['Alben', '📸'], tools: ['Tools', '🧰'], einstellungen: ['Einstellungen', '⚙️'],
};

/**
 * Stellt eine alte, angepasste Sidebar auf die neue Ordnung um: Reihenfolge und Gruppen
 * kommen vom neuen Standard, ausgeblendete Einträge sowie eigene Namen und Emojis bleiben.
 */
export function migrateSidebar(stored: NavItem[]): NavItem[] {
  const byPath = new Map(stored.map((s) => [s.path, s]));
  return DEFAULT_SIDEBAR.map((d) => {
    const s = byPath.get(d.path);
    if (!s) return d;
    const [oldLabel, oldIcon] = OLD_SIDEBAR[d.path] ?? ['', ''];
    return {
      ...d,
      hidden: !!s.hidden,
      label: s.label && s.label !== oldLabel ? s.label : d.label,
      icon: s.icon && s.icon !== oldIcon ? s.icon : '',
    };
  });
}

/**
 * Übernimmt die gespeicherte Anpassung, verwirft unbekannte Einträge und fügt
 * neue Standard-Einträge (z. B. nach einem Update) hinter ihrem Vorgänger ein –
 * so landet „Einkaufsliste“ hinter „Finanzen“ statt ganz unten.
 */
export function mergeWithDefaults<T, K extends keyof T>(stored: T[] | undefined, defaults: T[], key: K, group?: keyof T): T[] {
  if (!Array.isArray(stored) || stored.length === 0) return defaults;
  const known = new Set(defaults.map((d) => d[key]));
  const seen = new Set<T[K]>();
  const kept = stored.filter((s) => {
    if (!known.has(s[key]) || seen.has(s[key])) return false;
    seen.add(s[key]);
    return true;
  });
  const result = [...kept];
  defaults.forEach((d, i) => {
    if (seen.has(d[key])) return;
    // Nächsten Vorgänger aus dem Standard suchen, der schon in der Liste steht –
    // bei Gruppen (Sidebar) bevorzugt einen aus derselben Gruppe
    const sameGroup = (r: T) => !group || r[group] === d[group];
    let at = -1;
    for (const strict of group ? [true, false] : [false]) {
      for (let j = i - 1; j >= 0 && at < 0; j--) {
        const idx = result.findIndex((r) => r[key] === defaults[j][key] && (!strict || sameGroup(r)));
        if (idx >= 0) at = idx + 1;
      }
      if (at < 0 && strict) {
        // Kein Vorgänger der Gruppe da: vor den ersten Eintrag der Gruppe
        const first = result.findIndex((r) => sameGroup(r) && defaults.some((x) => x[key] === r[key]));
        if (first >= 0) at = first;
      }
      if (at >= 0) break;
    }
    if (at < 0) at = 0;
    result.splice(at, 0, d);
    seen.add(d[key]);
  });
  return result;
}

/** Verschiebt einen Eintrag um eine Position nach vorn (-1) oder hinten (+1). */
export function moveItem<T>(list: T[], index: number, dir: -1 | 1): T[] {
  const j = index + dir;
  if (j < 0 || j >= list.length) return list;
  const next = [...list];
  [next[index], next[j]] = [next[j], next[index]];
  return next;
}

/** Verschiebt einen Eintrag an eine andere Stelle (Ziehen und Ablegen). */
export function moveTo<T>(list: T[], from: number, to: number): T[] {
  if (from === to || from < 0 || to < 0 || from >= list.length || to >= list.length) return list;
  const next = [...list];
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item);
  return next;
}

export type StackPage = 'heute' | 'aufgaben' | 'ringe' | 'budget' | 'fokus' | 'pruefung';

/** Reihenfolge im Smart Stack je nach Tageszeit – wie auf dem iPhone. */
export function stackOrder(hour: number): StackPage[] {
  if (hour >= 5 && hour < 11) return ['heute', 'aufgaben', 'pruefung', 'fokus', 'ringe', 'budget'];
  if (hour >= 11 && hour < 17) return ['aufgaben', 'fokus', 'heute', 'pruefung', 'ringe', 'budget'];
  if (hour >= 17 && hour < 23) return ['ringe', 'budget', 'heute', 'aufgaben', 'pruefung', 'fokus'];
  return ['heute', 'ringe', 'aufgaben', 'budget', 'pruefung', 'fokus'];
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
