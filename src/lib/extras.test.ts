import { describe, expect, it } from 'vitest';
import type { Data, ShoppingItem, Task, Trip } from '../types';
import { emptyData } from '../store';
import { boughtItems, parseReceipt } from './receipt';
import { placeNotices } from './places';
import { mergeHealth, defaultHealth } from './health';
import { focusActivityState, activityKey } from './liveactivity';
import { idleTimer, start, pause } from './focus';
import { isLockedPage } from './lock';

let n = 0;
const id = () => `id${++n}`;
const item = (name: string, patch: Partial<ShoppingItem> = {}): ShoppingItem => ({ id: name, name, amount: '', aisle: 'sonstiges', done: false, added: '2026-11-01', ...patch });

describe('Kassenzettel', () => {
  const lines = ['REWE Markt GmbH', 'Hauptstr. 5', 'MILCH 1,5% 1,09 B', 'EIER 10ER 2,99 B', 'HACKFLEISCH GEM. 4,49 B', '-----', 'SUMME EUR 8,57', 'Geg. EC-Karte 8,57', 'MwSt 7% 0,56', '03.11.26 17:12 Bon 1234'];
  it('liest Geschäft, Summe, Datum und Artikel', () => {
    const r = parseReceipt(lines);
    expect(r).toMatchObject({ store: 'Rewe', total: 8.57, date: '2026-11-03' });
    expect(r.items).toEqual(['MILCH 1,5%', 'EIER 10ER', 'HACKFLEISCH GEM.']);
  });
  it('nimmt ohne Summe den größten Betrag', () => {
    expect(parseReceipt(['Bäckerei Schmidt', 'Brezel 0,95', 'Kaffee 2,80']).total).toBe(2.8);
  });
  it('findet gekaufte Artikel der Einkaufsliste', () => {
    const r = parseReceipt(lines);
    const found = boughtItems(r, [item('Milch'), item('Eier'), item('Hackfleisch'), item('Gurken'), item('Eis', { done: true })]);
    expect(found.map((f) => f.name)).toEqual(['Milch', 'Eier', 'Hackfleisch']);
  });
});

describe('Orte', () => {
  const base = (): Data => {
    const d = emptyData();
    d.settings.places = [
      { id: 'markt', name: 'Rewe', lat: 1, lon: 2, radius: 50, kind: 'einkauf' },
      { id: 'bib', name: 'Bibliothek', lat: 1, lon: 2, radius: 150, kind: 'ort' },
      { id: 'home', name: 'Zuhause', lat: 1, lon: 2, radius: 150, kind: 'zuhause' },
    ];
    return d;
  };
  it('zeigt die Einkaufsliste, Aufgaben am Ort und die Packliste vor der Reise', () => {
    const d = base();
    d.shopping = [item('Milch', { amount: '2' }), item('Brot'), item('Käse', { done: true })];
    d.tasks = [{ id: 't', title: 'Buch zurückgeben', courseId: null, kind: 'Aufgabe', status: 'offen', priority: 'mittel', due: null, placeId: 'bib' } as Task];
    d.trips = [{ id: 'r', title: 'Berlin', start: '2026-11-04', end: '2026-11-06', cover: '', budget: 0, legs: [], note: '', packing: [{ id: 'p', title: 'Ladekabel', section: '', done: false }, { id: 'q', title: 'Pass', section: '', done: true }] } as Trip];
    const out = placeNotices(d, new Date('2026-11-03T18:00:00'));
    expect(out.map((o) => [o.id, o.title, o.body, o.onExit, o.radius])).toEqual([
      ['markt', '🛒 Du bist bei Rewe', '2 Sachen auf der Einkaufsliste: 2 Milch, Brot', false, 100],
      ['bib', '📍 Bibliothek', 'Buch zurückgeben', false, 150],
      ['home', '🧳 Berlin: noch nicht eingepackt', '1 von 2 eingepackt – fehlt noch: Ladekabel', true, 150],
    ]);
  });
  it('meldet nichts, wenn es nichts zu tun gibt', () => {
    expect(placeNotices(base(), new Date('2026-11-03T18:00:00'))).toEqual([]);
  });
});

describe('Apple Health', () => {
  it('übernimmt Workouts einmal, Schritte, Schlaf und füllt das Tagebuch', () => {
    const d = emptyData();
    d.moods = [{ id: 'm', date: '2026-11-03', mood: 4, note: '', sleep: null }];
    const values = { days: [{ date: '2026-11-03', steps: 6120.4, sleepMinutes: 444 }], workouts: [{ id: 'w1', start: new Date('2026-11-03T07:00:00').getTime(), minutes: 32.4, type: 'Laufen' }] };
    const once = mergeHealth(d, values, { ...defaultHealth(), enabled: true }, id);
    expect(once.workouts).toMatchObject([{ title: 'Laufen', date: '2026-11-03', done: true, minutes: 32, healthId: 'w1' }]);
    expect(once.healthDays).toMatchObject([{ date: '2026-11-03', steps: 6120, sleepMinutes: 444 }]);
    expect(once.moods[0].sleep).toBe(7.5);
    const twice = mergeHealth(once, values, { ...defaultHealth(), enabled: true }, id);
    expect(twice.workouts).toHaveLength(1);
    expect(twice.healthDays).toHaveLength(1);
  });
});

describe('Live-Aktivität und Sperre', () => {
  it('beschreibt den laufenden und pausierten Timer', () => {
    const running = start(idleTimer(), 1_000_000);
    const s = focusActivityState(running, { name: 'Analysis', code: 'ANA', color: '#FF9500' }, 1_060_000)!;
    expect(s).toMatchObject({ label: 'Analysis', phase: 'fokus', paused: false, endAt: 1_000_000 + 25 * 60_000, color: '#FF9500', round: 1, rounds: 4 });
    const paused = focusActivityState(pause(running, 1_060_000), undefined, 1_100_000)!;
    expect(paused).toMatchObject({ paused: true, leftSeconds: 24 * 60, label: 'Lernen' });
    expect(activityKey(paused)).toBe(activityKey(focusActivityState(pause(running, 1_060_000), undefined, 1_200_000)));
    expect(focusActivityState(idleTimer(), undefined, 0)).toBeNull();
  });
  it('sperrt nur gewählte Seiten', () => {
    expect(isLockedPage({ enabled: true, pages: ['finanzen'] }, 'finanzen')).toBe(true);
    expect(isLockedPage({ enabled: false, pages: ['finanzen'] }, 'finanzen')).toBe(false);
    expect(isLockedPage({ enabled: true, pages: ['finanzen'] }, 'kalender')).toBe(false);
  });
});
