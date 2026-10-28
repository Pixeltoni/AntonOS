import { describe, expect, it } from 'vitest';
import { demoData } from '../demo';
import { DEFAULT_SIDEBAR } from './layout';
import { calculate, matchScore, searchAll, snippetAround, topHit } from './search';

describe('Spotlight-Suche', () => {
  it('bewertet Treffer', () => {
    expect(matchScore('ana', 'Analysis I')).toBeGreaterThan(matchScore('ana', 'Banane'));
    expect(matchScore('blatt 3', 'Übungsblatt 3')).toBeGreaterThan(0);
    expect(matchScore('blatt 9', 'Übungsblatt 3')).toBe(0);
    expect(matchScore('strasse', 'Straße')).toBeGreaterThan(0);
    expect(matchScore('uber', 'Über uns')).toBeGreaterThan(0);
    expect(matchScore('epsilon', 'Folgen', 'mit epsilon')).toBe(2);
  });

  it('findet in allen Bereichen', () => {
    const data = demoData();
    const hits = searchAll(data, 'analysis', DEFAULT_SIDEBAR);
    expect(hits.map((h) => h.group)).toContain('Prüfungen');
    expect(hits.some((h) => h.group === 'Kurse' && h.href === '#/kurse/demo-ana')).toBe(true);
    expect(topHit(hits)?.title).toBe('Analysis I');
    expect(searchAll(data, 'konvergiert', DEFAULT_SIDEBAR).find((h) => h.group === 'Notizen')?.href).toBe('#/notizen/demo-n1');
    expect(searchAll(data, 'einkauf', DEFAULT_SIDEBAR)[0]).toMatchObject({ group: 'Seiten', href: '#/einkauf' });
    expect(searchAll(data, '   ', DEFAULT_SIDEBAR)).toEqual([]);
  });

  it('zeigt einen Ausschnitt', () => {
    expect(snippetAround('Eine lange Notiz über **Konvergenz** von Folgen', 'konvergenz', 10)).toBe('…otiz über Konvergenz von Folge…');
  });

  it('rechnet', () => {
    expect(calculate('12*3')).toBe(36);
    expect(calculate('(2+3) × 4')).toBe(20);
    expect(calculate('1,5 + 2,25')).toBe(3.75);
    expect(calculate('19% * 200')).toBe(38);
    expect(calculate('-3 + 5')).toBe(2);
    expect(calculate('42')).toBeNull();
    expect(calculate('analysis')).toBeNull();
    expect(calculate('2+')).toBeNull();
  });
});
