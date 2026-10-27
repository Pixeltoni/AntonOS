import { describe, expect, it } from 'vitest';
import type { HabitLog, Transaction } from '../types';
import {
  completionRate,
  monthGrid,
  monthTotals,
  periodProgress,
  safeHttpUrl,
  safeImageSrc,
  shiftMonth,
  spotifyEmbedUrl,
  streak,
} from './life';

describe('Zeitfortschritt', () => {
  it('berechnet Tag, Woche, Monat und Jahr', () => {
    // Mittwoch, 1. Juli 2026, 12:00 Uhr
    const p = periodProgress(new Date(2026, 6, 1, 12));
    expect(p.day).toBeCloseTo(50);
    expect(p.week).toBeCloseTo((2.5 / 7) * 100);
    expect(p.month).toBeCloseTo((0.5 / 31) * 100);
    expect(p.year).toBeGreaterThan(49);
    expect(p.year).toBeLessThan(51);
  });
});

describe('Kalender', () => {
  it('beginnt am Montag und enthält den ganzen Monat', () => {
    const grid = monthGrid(2026, 9); // Oktober 2026, der 1. ist ein Donnerstag
    expect(grid).toHaveLength(42);
    expect(grid[0]).toBe('2026-09-28');
    expect(grid[3]).toBe('2026-10-01');
    expect(grid).toContain('2026-10-31');
  });
  it('wechselt über Jahresgrenzen', () => {
    expect(shiftMonth('2026-12', 1)).toBe('2027-01');
    expect(shiftMonth('2026-01', -1)).toBe('2025-12');
  });
});

describe('Gewohnheiten', () => {
  const log = (date: string): HabitLog => ({ id: date, habitId: 'h', date });
  const logs = ['2026-10-24', '2026-10-25', '2026-10-26'].map(log);

  it('zählt die Serie bis gestern, solange heute noch offen ist', () => {
    expect(streak(logs, 'h', '2026-10-27')).toBe(3);
    expect(streak([...logs, log('2026-10-27')], 'h', '2026-10-27')).toBe(4);
  });
  it('bricht nach einem ausgelassenen Tag ab', () => {
    expect(streak(logs, 'h', '2026-10-28')).toBe(0);
  });
  it('berechnet die Quote', () => {
    expect(completionRate(logs, 'h', '2026-10-27', 10)).toBe(30);
  });
});

describe('Finanzen', () => {
  const tx = (type: Transaction['type'], amount: number, category: string, date: string): Transaction => ({
    id: `${type}${amount}`, type, amount, category, date, description: '', account: '',
  });
  it('summiert einen Monat', () => {
    const t = monthTotals(
      [tx('Einnahme', 1000, 'Job', '2026-10-01'), tx('Ausgabe', 30, 'Essen', '2026-10-02'), tx('Ausgabe', 20, 'Essen', '2026-10-05'), tx('Ausgabe', 400, 'Miete', '2026-10-03'), tx('Ausgabe', 99, 'Essen', '2026-09-30')],
      '2026-10',
    );
    expect(t).toMatchObject({ income: 1000, expenses: 450, balance: 550 });
    expect(t.byCategory).toEqual([{ category: 'Miete', amount: 400 }, { category: 'Essen', amount: 50 }]);
  });
});

describe('sichere URLs', () => {
  it('lässt nur http(s) zu', () => {
    expect(safeHttpUrl('notion.so')).toBe('https://notion.so/');
    expect(safeHttpUrl('javascript:alert(1)')).toBeNull();
    expect(safeImageSrc('data:image/png;base64,AAAA')).toBe('data:image/png;base64,AAAA');
    expect(safeImageSrc('data:text/html;base64,AAAA')).toBeNull();
  });
  it('erzeugt Spotify-Einbettungen', () => {
    expect(spotifyEmbedUrl('https://open.spotify.com/intl-de/playlist/37i9dQZF1DX4wta20PHgwo?si=abc')).toBe(
      'https://open.spotify.com/embed/playlist/37i9dQZF1DX4wta20PHgwo',
    );
    expect(spotifyEmbedUrl('https://evil.example/playlist/abc')).toBeNull();
  });
});
