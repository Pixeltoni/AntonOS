import { describe, expect, it } from 'vitest';
import { demoData } from '../demo';
import { AREA_COLORS, areaColor, areaHints, dayPhase, DEFAULT_TABS, greeting, NEUTRAL_COLOR, normalizeTabs, pageColor, storyWeek, todaySections } from './areas';

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
