import { describe, expect, it } from 'vitest';
import { backgroundCss, dimOpacity, normalizeAppearanceData } from './appearance';
import type { Appearance } from '../types';

const base: Appearance = { theme: 'system', image: '', dim: 35 };

describe('Hintergrundbild', () => {
  it('ohne Bild kein Hintergrund', () => {
    expect(backgroundCss(base)).toBeNull();
  });
  it('Link und Upload werden zu CSS', () => {
    expect(backgroundCss({ ...base, image: 'https://example.com/bg.jpg' })).toContain('url("https://example.com/bg.jpg")');
    expect(backgroundCss({ ...base, image: 'data:image/jpeg;base64,AAAA' })).toContain('data:image/jpeg');
  });
  it('gefährliche Werte werden verworfen oder maskiert', () => {
    expect(backgroundCss({ ...base, image: 'javascript:alert(1)' })).toBeNull();
    expect(backgroundCss({ ...base, image: 'https://x.de/a")b.jpg' })).not.toContain('a")b');
  });
  it('Schleier bleibt zwischen 0 und 80 %', () => {
    expect(dimOpacity({ ...base, dim: 120 })).toBe(0.8);
    expect(dimOpacity({ ...base, dim: -5 })).toBe(0);
  });
});

describe('normalizeAppearanceData', () => {
  it('nimmt Standard bei Unsinn', () => {
    expect(normalizeAppearanceData(null, base)).toEqual(base);
    expect(normalizeAppearanceData({ theme: 'lila', image: 5, dim: 'x' }, base)).toEqual(base);
  });
  it('übernimmt Bild und Schleier', () => {
    expect(normalizeAppearanceData({ theme: 'dunkel', image: 'https://x.de/a.jpg', dim: 50 }, base)).toEqual({ theme: 'dunkel', image: 'https://x.de/a.jpg', dim: 50 });
  });
  it('holt ein früher gewähltes Bild zurück, aber nicht bei anderem Hintergrund', () => {
    expect(normalizeAppearanceData({ background: 'bild', image: 'https://x.de/a.jpg', dim: 30 }, base).image).toBe('https://x.de/a.jpg');
    expect(normalizeAppearanceData({ background: 'verlauf', image: 'https://x.de/a.jpg' }, base).image).toBe('');
  });
  it('verwirft unsichere Bild-Adressen', () => {
    expect(normalizeAppearanceData({ image: 'javascript:alert(1)' }, base).image).toBe('');
  });
});
