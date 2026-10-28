import { describe, expect, it } from 'vitest';
import { newEventsOnly, parseICS, toICS } from './ics';
import type { CalEvent } from '../types';

const ev = (patch: Partial<CalEvent>): CalEvent => ({
  id: 'a1', title: 'Lerngruppe', note: '', start: '2026-11-05', end: null, startTime: '14:00', endTime: '16:00', priority: 'mittel', ...patch,
});

describe('iCalendar', () => {
  it('exportiert und importiert Termine verlustfrei', () => {
    const events = [
      ev({ location: 'Bibliothek, 2. OG', note: 'Blatt 4; mitbringen', remind: 15, repeat: { freq: 'zweiwoechentlich', until: '2027-02-01', except: ['2026-11-19'] } }),
      ev({ id: 'b', title: 'Urlaub', start: '2026-12-23', end: '2026-12-27', startTime: '', endTime: '', priority: 'hoch' }),
    ];
    const back = parseICS(toICS(events));
    expect(back).toHaveLength(2);
    expect(back[0]).toMatchObject({ title: 'Lerngruppe', start: '2026-11-05', startTime: '14:00', endTime: '16:00', location: 'Bibliothek, 2. OG', note: 'Blatt 4; mitbringen', remind: 15 });
    expect(back[0].repeat).toEqual({ freq: 'zweiwoechentlich', until: '2027-02-01', except: ['2026-11-19'] });
    expect(back[1]).toMatchObject({ title: 'Urlaub', start: '2026-12-23', end: '2026-12-27', startTime: '', priority: 'hoch', repeat: null });
  });

  it('liest gefaltete Zeilen, Zeitzonen und Dauer', () => {
    const text = [
      'BEGIN:VCALENDAR',
      'BEGIN:VEVENT',
      'SUMMARY:Sehr langer',
      '  Titel',
      'DTSTART;TZID="Europe/Berlin":20261110T090000',
      'DURATION:PT1H30M',
      'END:VEVENT',
      'BEGIN:VEVENT',
      'SUMMARY:Feiertag',
      'DTSTART;VALUE=DATE:20261225',
      'DTEND;VALUE=DATE:20261226',
      'RRULE:FREQ=YEARLY',
      'END:VEVENT',
      'END:VCALENDAR',
    ].join('\r\n');
    const [a, b] = parseICS(text);
    expect(a).toMatchObject({ title: 'Sehr langer Titel', start: '2026-11-10', startTime: '09:00', endTime: '10:30', end: null });
    expect(b).toMatchObject({ title: 'Feiertag', start: '2026-12-25', end: null, startTime: '', repeat: { freq: 'jaehrlich', until: null, except: [] } });
  });

  it('überspringt schon vorhandene Termine', () => {
    const incoming = parseICS(toICS([ev({}), ev({ id: 'c', title: 'Neu' })]));
    expect(newEventsOnly([ev({})], incoming).map((e) => e.title)).toEqual(['Neu']);
  });
});
