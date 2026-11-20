import { describe, expect, it } from 'vitest';
import { clockCountdown, untilWords } from './countdown';

describe('Countdown', () => {
  it('zeigt Stunden nur ab einer Stunde', () => {
    expect(clockCountdown((8 * 3600 + 5 * 60 + 9) * 1000)).toBe('8:05:09');
    expect(clockCountdown((4 * 60 + 9) * 1000 + 999)).toBe('4:09');
    expect(clockCountdown(-5000)).toBe('0:00');
  });
  it('beschreibt die Zeit bis zum Termin in Worten', () => {
    expect(untilWords(0)).toBe('jetzt');
    expect(untilWords(2.5 * 60_000)).toBe('in 3 Min.');
    expect(untilWords(125 * 60_000)).toBe('in 2 Std. 5 Min.');
    expect(untilWords(120 * 60_000)).toBe('in 2 Std.');
    expect(untilWords(80 * 3600_000)).toBe('in 3 Tagen');
  });
});
