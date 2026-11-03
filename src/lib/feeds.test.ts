import { describe, expect, it } from 'vitest';
import type { CalEvent } from '../types';
import { applyFeed, feedError, feedName, feedStale, feedUrl, FEED_REFRESH } from './feeds';

const ics = (summary: string) => `BEGIN:VCALENDAR\r\nX-WR-CALNAME:Stundenplan WS\r\nBEGIN:VEVENT\r\nSUMMARY:${summary}\r\nDTSTART:20261104T101500\r\nDTEND:20261104T114500\r\nLOCATION:HS 2\r\nEND:VEVENT\r\nEND:VCALENDAR`;
let n = 0;
const id = () => `id${++n}`;
const own: CalEvent = { id: 'own', title: 'Zahnarzt', note: '', start: '2026-11-05', end: null, startTime: '09:00', endTime: '', priority: 'mittel' };

describe('Kalender-Abos', () => {
  it('macht aus webcal:// einen https-Link und lehnt anderes ab', () => {
    expect(feedUrl(' webcal://campus.example.de/ics?id=1 ')).toBe('https://campus.example.de/ics?id=1');
    expect(feedUrl('ftp://x')).toBeNull();
    expect(feedUrl('kein link')).toBeNull();
  });

  it('liest den Namen aus dem Kalender', () => {
    expect(feedName(ics('A'), 'https://x.de')).toBe('Stundenplan WS');
    expect(feedName('BEGIN:VCALENDAR', 'https://www.uni.de/a.ics')).toBe('uni.de');
  });

  it('ersetzt nur die Termine des Abos', () => {
    const first = applyFeed([own], { id: 'f', color: 'lila' }, ics('Analysis'), id);
    expect(first.count).toBe(1);
    expect(first.events.find((e) => e.feedId === 'f')).toMatchObject({ title: 'Analysis', location: 'HS 2', color: 'lila', startTime: '10:15' });
    const second = applyFeed(first.events, { id: 'f', color: 'lila' }, ics('Lineare Algebra'), id);
    expect(second.events.map((e) => e.title)).toEqual(['Zahnarzt', 'Lineare Algebra']);
  });

  it('versteht Komponenten in Kleinbuchstaben', () => {
    const lower = ics('Analysis').replace('BEGIN:VEVENT', 'BEGIN:vevent').replace('END:VEVENT', 'end:vevent');
    expect(applyFeed([], { id: 'f', color: 'blau' }, lower, id).count).toBe(1);
  });

  it('lädt nach drei Stunden neu und erklärt Fehler', () => {
    const feed = { id: 'f', name: 'x', url: 'https://x', color: 'blau' as const, lastSync: 1000 };
    expect(feedStale(feed, 1000 + FEED_REFRESH - 1)).toBe(false);
    expect(feedStale(feed, 1000 + FEED_REFRESH + 1)).toBe(true);
    expect(feedError(404)).toMatch(/404/);
    expect(feedError(200, '<html>')).toMatch(/kein Kalender/);
    expect(feedError(200, ics('A'))).toBe('');
  });
});
