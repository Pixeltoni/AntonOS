import { describe, expect, it } from 'vitest';
import { layoutTimed, onDay, rangeLabel, shiftAnchor, sortEntries, validateEvent, weekDays, type CalendarEntry } from './calendar';
import { isoWeek } from './dates';

const entry = (patch: Partial<CalendarEntry>): CalendarEntry => ({
  key: 'k', start: '2026-10-27', end: '2026-10-27', time: '', endTime: '', label: 'x', kind: 'event', ...patch,
});

describe('Kalender', () => {
  it('zeigt mehrtägige Termine an jedem Tag des Zeitraums', () => {
    const e = entry({ start: '2026-10-30', end: '2026-11-02' });
    expect(['2026-10-29', '2026-10-30', '2026-11-01', '2026-11-02', '2026-11-03'].map((d) => onDay(e, d))).toEqual([false, true, true, true, false]);
  });

  it('sortiert ganztägig zuerst, dann nach Zeit und Wichtigkeit', () => {
    const list = [
      entry({ key: 'b', time: '14:00' }),
      entry({ key: 'a', time: '' }),
      entry({ key: 'd', time: '09:00', priority: 'niedrig' }),
      entry({ key: 'c', time: '09:00', priority: 'hoch' }),
    ];
    expect(sortEntries(list).map((e) => e.key)).toEqual(['a', 'c', 'd', 'b']);
  });

  it('berechnet die Woche ab Montag', () => {
    expect(weekDays('2026-11-01')).toEqual(['2026-10-26', '2026-10-27', '2026-10-28', '2026-10-29', '2026-10-30', '2026-10-31', '2026-11-01']);
  });

  it('blättert nach Tag, Woche und Monat', () => {
    expect(shiftAnchor('tag', '2026-10-31', 1)).toBe('2026-11-01');
    expect(shiftAnchor('woche', '2026-10-27', -1)).toBe('2026-10-20');
    expect(shiftAnchor('monat', '2026-01-31', 1)).toBe('2026-02-01');
  });

  it('beschriftet die Ansichten', () => {
    expect(rangeLabel('woche', '2026-10-27', isoWeek)).toBe('KW 44 · 26.10.–01.11.2026');
    expect(rangeLabel('monat', '2026-10-27', isoWeek)).toBe('Oktober 2026');
  });

  it('prüft die Eingaben eines Termins', () => {
    const ok = { title: 'Arzt', start: '2026-10-27', end: null, startTime: '', endTime: '' };
    expect(validateEvent(ok)).toBeNull();
    expect(validateEvent({ ...ok, title: ' ' })).toMatch(/Namen/);
    expect(validateEvent({ ...ok, end: '2026-10-26' })).toMatch(/Enddatum/);
    expect(validateEvent({ ...ok, startTime: '10:00', endTime: '09:00' })).toMatch(/Endzeit/);
    expect(validateEvent({ ...ok, end: '2026-10-28', startTime: '10:00', endTime: '09:00' })).toBeNull();
  });
});

describe('Zeitleiste', () => {
  it('positioniert Termine nach Uhrzeit und Dauer', () => {
    const [b] = layoutTimed([entry({ time: '09:30', endTime: '11:00' })], '2026-10-27');
    expect([b.start, b.end, b.col, b.cols]).toEqual([570, 660, 0, 1]);
  });
  it('nimmt ohne Endzeit eine Stunde an', () => {
    expect(layoutTimed([entry({ time: '14:00' })], '2026-10-27')[0].end).toBe(900);
  });
  it('legt überlappende Termine nebeneinander', () => {
    const blocks = layoutTimed(
      [
        entry({ key: 'a', time: '09:00', endTime: '10:00' }),
        entry({ key: 'b', time: '09:30', endTime: '10:30' }),
        entry({ key: 'c', time: '11:00', endTime: '12:00' }),
      ],
      '2026-10-27',
    );
    const by = Object.fromEntries(blocks.map((b) => [b.entry.key, [b.col, b.cols]]));
    expect(by).toEqual({ a: [0, 2], b: [1, 2], c: [0, 1] });
  });
  it('zeigt mehrtägige Termine nicht in der Zeitleiste', () => {
    expect(layoutTimed([entry({ time: '10:00', end: '2026-10-29' })], '2026-10-27')).toEqual([]);
  });
});
