import { describe, expect, it } from 'vitest';
import { countDuration, easeOutQuart, staggerDelay, tween } from './motion';

describe('Bewegung', () => {
  it('Kurve beginnt bei 0, endet bei 1 und bleibt in den Grenzen', () => {
    expect(easeOutQuart(0)).toBe(0);
    expect(easeOutQuart(1)).toBe(1);
    expect(easeOutQuart(-2)).toBe(0);
    expect(easeOutQuart(5)).toBe(1);
    expect(easeOutQuart(Number.NaN)).toBe(1);
    expect(easeOutQuart(0.5)).toBeGreaterThan(0.5);
  });

  it('Zwischenwert läuft vom Start zum Ziel', () => {
    expect(tween(0, 100, 0, 1000)).toBe(0);
    expect(tween(0, 100, 1000, 1000)).toBe(100);
    expect(tween(0, 100, 2000, 1000)).toBe(100);
    expect(tween(10, 0, 500, 1000)).toBeLessThan(10);
    expect(tween(5, 7, 0, 0)).toBe(7);
  });

  it('kleine Sprünge zählen kürzer als große', () => {
    expect(countDuration(3, 3)).toBe(0);
    expect(countDuration(3, 4)).toBeLessThan(countDuration(0, 732.71));
    expect(countDuration(0, 1_000_000)).toBe(1400);
  });

  it('Kacheln erscheinen versetzt, aber nie länger als gedeckelt', () => {
    expect(staggerDelay(0)).toBe(0);
    expect(staggerDelay(2)).toBe(90);
    expect(staggerDelay(100)).toBe(540);
    expect(staggerDelay(-1)).toBe(0);
  });
});
