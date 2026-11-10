import { describe, expect, it } from 'vitest';
import { demoData } from '../demo';
import { AREA_COLORS, areaBadges, areaColor, areaHints, areaSummary, areaUrgent, dayPhase, DEFAULT_TABS, greeting, moveNavItem, NEUTRAL_COLOR, normalizeTabs, pageColor, pushRecent, quickActions, RECENT_MAX, storyWeek, tileColor, todaySections, todayTiles } from './areas';
import type { NavItem } from '../types';

describe('Bereichsfarben', () => {
  it('feste Farben für die Standardgruppen', () => {
    expect(areaColor('Geld')).toBe(AREA_COLORS.Geld);
    expect(areaColor('')).toBe(NEUTRAL_COLOR);
  });
  it('eigene Gruppen bekommen immer dieselbe Farbe', () => {
    expect(areaColor('Hobbys')).toBe(areaColor('Hobbys'));
    expect(areaColor('Hobbys')).toMatch(/^#/);
  });
  it('Seite nimmt die Farbe ihrer Gruppe', () => {
    const items = [{ path: 'finanzen', group: 'Geld' }, { path: 'kurse', group: 'Studium' }];
    expect(pageColor('finanzen', items)).toBe(AREA_COLORS.Geld);
    expect(pageColor('heute', items)).toBe(AREA_COLORS.Start);
    expect(pageColor('unbekannt', items)).toBe(AREA_COLORS.Start);
  });
});

describe('Tab-Leiste', () => {
  const known = ['dashboard', 'kalender', 'aufgaben', 'notizen', 'training', 'einstellungen'];
  it('ohne Einstellung die Standard-Tabs', () => {
    expect(normalizeTabs(undefined, known)).toEqual(DEFAULT_TABS);
  });
  it('entfernt Unbekanntes und Doppeltes und füllt auf drei auf', () => {
    expect(normalizeTabs(['training', 'training', 'gibtsnicht'], known)).toEqual(['training', 'heute', 'kalender']);
  });
  it('höchstens drei', () => {
    expect(normalizeTabs(['notizen', 'training', 'kalender', 'aufgaben'], known)).toEqual(['notizen', 'training', 'kalender']);
  });
});

describe('Hinweise auf den Kacheln', () => {
  it('zählt fällige Aufgaben und Einkäufe', () => {
    const d = demoData();
    d.tasks = [
      { id: 'a', title: 'A', courseId: null, kind: 'Aufgabe', status: 'offen', priority: 'mittel', due: '2026-11-01' },
      { id: 'b', title: 'B', courseId: null, kind: 'Aufgabe', status: 'offen', priority: 'mittel', due: null },
    ];
    d.shopping = [{ id: 's', name: 'Milch', amount: '', aisle: '', done: false, added: '' }];
    const hints = areaHints(d, '2026-11-03', new Date(2026, 10, 3, 9));
    expect(hints.aufgaben).toBe('1 fällig');
    expect(hints.einkauf).toBe('1 auf der Liste');
  });
  it('ohne Daten keine Hinweise', () => {
    const d = demoData();
    d.tasks = [];
    d.shopping = [];
    const hints = areaHints(d, '2026-11-03', new Date(2026, 10, 3, 9));
    expect(hints.aufgaben).toBeUndefined();
    expect(hints.einkauf).toBeUndefined();
  });
  it('Routinen: Serie oder Stand von heute', () => {
    const d = demoData();
    const runs = ['2026-11-01', '2026-11-02', '2026-11-03'].map((date) => ({ date, minutes: 20, done: 4, skipped: 0 }));
    d.routines = [{ id: 'r', name: 'Morgen', icon: '🌅', color: '#FF9500', steps: [{ id: 's', title: 'Wasser', icon: '💧', minutes: 1 }], runs }];
    expect(areaHints(d, '2026-11-03', new Date(2026, 10, 3, 9)).routinen).toBe('🌅 3 Tage in Folge');
    d.routines[0].runs = [];
    expect(areaHints(d, '2026-11-03', new Date(2026, 10, 3, 9)).routinen).toBe('0 von 1 heute');
  });
});

describe('Woche für die Story', () => {
  it('sonntags die laufende Woche', () => {
    expect(storyWeek('2026-11-01')).toEqual({ day: '2026-11-01', until: '2026-11-01', current: true });
  });
  it('sonst die letzte volle Woche', () => {
    expect(storyWeek('2026-11-03')).toEqual({ day: '2026-11-01', until: '2026-11-01', current: false });
    expect(storyWeek('2026-11-02')).toEqual({ day: '2026-11-01', until: '2026-11-01', current: false });
  });
});

describe('Heute nach Tageszeit', () => {
  const at = (h: number, m = 0) => new Date(2026, 10, 3, h, m);
  it('Tageszeiten', () => {
    expect(dayPhase(at(7))).toBe('morgen');
    expect(dayPhase(at(13))).toBe('tag');
    expect(dayPhase(at(19))).toBe('abend');
    expect(dayPhase(at(1))).toBe('abend');
  });
  it('früheres Tag-abschließen zieht den Abend vor', () => {
    expect(dayPhase(at(17, 30), '17:00')).toBe('abend');
  });
  it('abends steht der Abschluss oben, morgens der Termin', () => {
    expect(todaySections('abend')[0]).toBe('abschluss');
    expect(todaySections('morgen')[0]).toBe('termin');
    // Die Routine zur Tageszeit gleich darunter
    expect(todaySections('morgen')[1]).toBe('routine');
    expect(todaySections('abend')[1]).toBe('routine');
  });
  it('Begrüßung', () => {
    expect(greeting(at(8))).toBe('Guten Morgen');
    expect(greeting(at(23))).toBe('Gute Nacht');
  });
});

describe('Kachelfarben', () => {
  it('Nachbarn in einer Gruppe unterscheiden sich, gleiche Stelle bleibt gleich', () => {
    expect(tileColor('Leben', 0)).not.toBe(tileColor('Leben', 1));
    expect(tileColor('Leben', 3)).toBe(tileColor('Leben', 3));
    expect(tileColor('Leben', 0)).toMatch(/^hsl\(/);
  });
  it('ohne Gruppe neutral', () => {
    expect(tileColor('', 2)).toBe(NEUTRAL_COLOR);
  });
});

describe('Abzeichen, Wichtiges und Überblick', () => {
  const t = '2026-11-03';
  const now = new Date(2026, 10, 3, 9);
  const base = () => {
    const d = demoData();
    d.tasks = [{ id: 'a', title: 'A', courseId: null, kind: 'Aufgabe', status: 'offen', priority: 'mittel', due: '2026-11-01' }];
    d.shopping = [{ id: 's', name: 'Milch', amount: '', aisle: '', done: false, added: '' }];
    d.cards = [];
    d.exams = [];
    d.alarms = [];
    d.people = [];
    d.trips = [];
    return d;
  };
  it('Abzeichen mit Zahl und kurzem Text', () => {
    const b = areaBadges(base(), t);
    expect(b.aufgaben).toEqual({ count: 1, text: 'fällig' });
    expect(b.einkauf.count).toBe(1);
    expect(b.lernen).toBeUndefined();
  });
  it('fällige Aufgaben und nahe Prüfungen sind wichtig', () => {
    const d = base();
    d.exams = [{ id: 'e', courseId: null, title: 'Analysis', date: '2026-11-08' } as never];
    expect(areaUrgent(d, t, now)).toEqual(['aufgaben', 'pruefungen']);
    d.exams = [{ id: 'e', courseId: null, title: 'Analysis', date: '2026-11-20' } as never];
    expect(areaUrgent(d, t, now)).toEqual(['aufgaben']);
  });
  it('Überblick höchstens vier Kennzahlen, Aufgaben vorne', () => {
    const s = areaSummary(demoData(), t, now);
    expect(s.length).toBeLessThanOrEqual(4);
    const d = base();
    expect(areaSummary(d, t, now)[0]).toEqual({ path: 'aufgaben', value: '1', label: 'fällig' });
  });
  it('Fokus und Noten bekommen Hinweise', () => {
    const d = base();
    d.sessions = [{ id: 'f', date: t, minutes: 25, courseId: null, distractions: 0 }, { id: 'g', date: t, minutes: 20, courseId: null, distractions: 0 }];
    expect(areaHints(d, t, now).fokus).toBe('45 Min heute');
  });
  it('nächste Vorlesung und Termin aus dem Kalender', () => {
    const entries = [
      { key: '1', start: t, end: t, time: '08:00', endTime: '', label: 'Früh', kind: 'lecture' as const },
      { key: '2', start: t, end: t, time: '10:15', endTime: '', label: 'Lineare Algebra', kind: 'lecture' as const },
      { key: '3', start: t, end: t, time: '12:00', endTime: '', label: 'Mittag', kind: 'event' as const },
    ];
    const h = areaHints(base(), t, now, { entries, pet: 'hunger' });
    expect(h.kurse).toBe('Lineare Algebra 10:15');
    expect(h.kalender).toBe('Lineare Algebra 10:15');
    expect(h.knubbel).toBe('hat Hunger');
  });
});

describe('Zuletzt benutzt', () => {
  it('neueste vorne, ohne Doppelte, begrenzt', () => {
    expect(pushRecent(['notizen', 'finanzen'], 'finanzen')).toEqual(['finanzen', 'notizen']);
    expect(pushRecent(['notizen'], 'bereiche')).toEqual(['notizen']);
    const many = Array.from({ length: 20 }, (_, i) => `seite${i}`);
    expect(pushRecent(many, 'neu')).toHaveLength(RECENT_MAX);
  });
});

describe('Kacheln verschieben', () => {
  const nav = (path: string, group: string): NavItem => ({ path, label: path, icon: '', group, hidden: false });
  const items = [nav('a', 'Start'), nav('b', 'Start'), nav('c', 'Geld'), nav('d', 'Geld')];
  it('vor eine andere Kachel, auch in eine andere Gruppe', () => {
    const r = moveNavItem(items, 'a', { before: 'd', group: 'Geld' });
    expect(r.map((i) => i.path)).toEqual(['b', 'c', 'a', 'd']);
    expect(r[2].group).toBe('Geld');
  });
  it('hinter eine Kachel (beim Ziehen nach unten)', () => {
    expect(moveNavItem(items, 'a', { after: 'b', group: 'Start' }).map((i) => i.path)).toEqual(['b', 'a', 'c', 'd']);
  });
  it('ans Ende einer Gruppe', () => {
    expect(moveNavItem(items, 'c', { group: 'Start' }).map((i) => `${i.path}:${i.group}`)).toEqual(['a:Start', 'b:Start', 'c:Start', 'd:Geld']);
  });
});

describe('Schnellaktionen', () => {
  it('Routinen aus den Daten', () => {
    const routines = [{ id: 'r', name: 'Morgen', icon: '🌅', color: '', steps: [{ id: 's', title: 'x', icon: '', minutes: 1 }], runs: [] }];
    expect(quickActions('routinen', { routines })).toEqual([{ label: '🌅 Morgen starten', href: '#/routinen/start/r' }]);
    expect(quickActions('fokus', { routines: [] })[0]).toEqual({ label: 'Fokus starten', run: 'focus' });
  });
});

describe('Kacheln auf Heute', () => {
  it('vier Kacheln in fester Reihenfolge mit Links', () => {
    const tiles = todayTiles(demoData(), '2026-11-10');
    expect(tiles.map((x) => x.key)).toEqual(['aufgaben', 'budget', 'fokus', 'lernen']);
    expect(tiles.every((x) => x.href.startsWith('#/') && Number.isFinite(x.value))).toBe(true);
  });
  it('zählt nur offene Aufgaben bis heute und nennt Überfällige', () => {
    const d = demoData();
    const base = { courseId: null, kind: 'Aufgabe', priority: 'mittel', note: '', status: 'offen' } as const;
    d.tasks = [
      { ...base, id: 'a', title: 'Gestern', due: '2026-11-09' },
      { ...base, id: 'b', title: 'Heute', due: '2026-11-10' },
      { ...base, id: 'c', title: 'Morgen', due: '2026-11-11' },
      { ...base, id: 'd', title: 'Erledigt', due: '2026-11-10', status: 'erledigt' },
    ] as typeof d.tasks;
    const tile = todayTiles(d, '2026-11-10')[0];
    expect(tile.value).toBe(2);
    expect(tile.hint).toBe('1 überfällig');
  });
  it('ohne Budget zeigt die Kachel den Saldo', () => {
    const d = demoData();
    d.settings.finance = { budget: 0, categoryBudgets: [], balanceCorrections: [] };
    expect(todayTiles(d, '2026-11-10')[1].label).toBe('Saldo im Monat');
  });
});
