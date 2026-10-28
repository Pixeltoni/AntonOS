import { describe, expect, it } from 'vitest';
import { describeRepeat, firstWeekday, nextOccurrence, occursOn, slotSeries, startsOn, weekdayOf } from './recurrence';
import { dueReminders, isTimedOn, onDay, type CalendarEntry } from './calendar';

// Mittwoch, 28.10.2026
const W = '2026-10-28';

describe('Wiederholungen', () => {
  it('wöchentlich, alle 2 Wochen, monatlich, jährlich', () => {
    const weekly = { freq: 'woechentlich' as const, until: null };
    expect(startsOn(weekly, W, '2026-11-04')).toBe(true);
    expect(startsOn(weekly, W, '2026-11-05')).toBe(false);
    expect(startsOn(weekly, W, '2026-10-21')).toBe(false);
    expect(startsOn({ freq: 'zweiwoechentlich', until: null }, W, '2026-11-04')).toBe(false);
    expect(startsOn({ freq: 'zweiwoechentlich', until: null }, W, '2026-11-11')).toBe(true);
    expect(startsOn({ freq: 'monatlich', until: null }, W, '2027-02-28')).toBe(true);
    expect(startsOn({ freq: 'jaehrlich', until: null }, W, '2027-10-28')).toBe(true);
    expect(startsOn({ freq: 'taeglich', until: '2026-10-30' }, W, '2026-10-31')).toBe(false);
  });
  it('lässt Ausnahmen aus und kennt mehrtägige Serien', () => {
    const rule = { freq: 'woechentlich' as const, until: null, except: ['2026-11-04'] };
    expect(startsOn(rule, W, '2026-11-04')).toBe(false);
    expect(startsOn(rule, W, '2026-11-11')).toBe(true);
    // Fr–So jedes Wochenende
    expect(occursOn({ freq: 'woechentlich', until: null }, '2026-10-30', '2026-11-01', '2026-11-08')).toBe(true);
    expect(occursOn({ freq: 'woechentlich', until: null }, '2026-10-30', '2026-11-01', '2026-11-09')).toBe(false);
  });
  it('findet das nächste Vorkommen und beschreibt die Serie', () => {
    expect(nextOccurrence({ freq: 'woechentlich', until: null, except: ['2026-11-04'] }, W, '2026-10-29')).toBe('2026-11-11');
    expect(nextOccurrence({ freq: 'woechentlich', until: '2026-11-01' }, W, '2026-10-29')).toBeNull();
    expect(describeRepeat({ freq: 'woechentlich', until: '2027-02-12' }, W)).toBe('Jeden Mittwoch bis 12.2.2027');
    expect(describeRepeat({ freq: 'zweiwoechentlich', until: null }, W)).toBe('Jeden 2. Mittwoch');
  });
  it('Wochentage', () => {
    expect(weekdayOf(W)).toBe(3);
    expect(firstWeekday(W, 1)).toBe('2026-11-02');
    expect(firstWeekday(W, 3)).toBe(W);
  });
  it('Stundenplan aus Kurszeiten', () => {
    const series = slotSeries(
      [{ id: 'ana', name: 'Analysis I', color: '#f00', slots: [{ id: 's', day: 1, start: '08:15', end: '09:45', room: 'H1', kind: 'Vorlesung', every: 1 }, { id: 'u', day: 4, start: '12:00', end: '14:00', room: '', kind: 'Übung', every: 2, from: '2026-10-29' }] }],
      { start: '2026-10-19', end: '2027-02-12' },
      W,
    );
    expect(series.map((s) => s.start)).toEqual(['2026-10-19', '2026-10-29']);
    expect(series[0].rule).toEqual({ freq: 'woechentlich', until: '2027-02-12', except: [] });
    const entry: CalendarEntry = { key: 'l', start: series[1].start, end: series[1].start, time: '12:00', endTime: '14:00', label: 'Ü', kind: 'lecture', recur: series[1].rule };
    expect(onDay(entry, '2026-11-12')).toBe(true);
    expect(onDay(entry, '2026-11-05')).toBe(false);
    expect(isTimedOn(entry, '2026-11-12')).toBe(true);
    expect(onDay(entry, '2027-02-18')).toBe(false);
  });
});

describe('Erinnerungen', () => {
  const e = { key: 'ev', start: '2026-10-21', end: '2026-10-21', time: '14:00', endTime: '', label: 'Lerngruppe', kind: 'event' as const, recur: { freq: 'woechentlich' as const, until: null }, remind: 15 };
  it('meldet sich im Erinnerungsfenster', () => {
    expect(dueReminders([e], new Date(2026, 9, 28, 13, 44))).toEqual([]);
    expect(dueReminders([e], new Date(2026, 9, 28, 13, 46)).map((r) => r.id)).toEqual(['ev@2026-10-28']);
    expect(dueReminders([e], new Date(2026, 9, 28, 14, 1))).toEqual([]);
    expect(dueReminders([{ ...e, remind: null }], new Date(2026, 9, 28, 13, 50))).toEqual([]);
  });
  it('einen Tag vorher', () => {
    expect(dueReminders([{ ...e, remind: 1440 }], new Date(2026, 9, 27, 14, 30)).map((r) => r.id)).toEqual(['ev@2026-10-28']);
  });
});
