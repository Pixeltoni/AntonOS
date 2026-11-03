import { describe, expect, it } from 'vitest';
import { countdown, feedPet, hatchPet, parsePet, petAge, petDeathAt, petFrame, petFullness, petMood, PET_LIMITS } from './pet';

const HOUR = 3_600_000;
const at = (h: number, m = 0) => new Date(2026, 10, 3, h, m);

describe('petMood', () => {
  const noon = at(12);
  const fedAgo = (ms: number) => ({ born: noon.getTime() - 5 * 24 * HOUR, fed: noon.getTime() - ms, meals: 3 });

  it('folgt dem Abstand zur letzten Mahlzeit', () => {
    expect(petMood(fedAgo(30_000), noon)).toBe('essen');
    expect(petMood(fedAgo(3 * 60_000), noon)).toBe('party');
    expect(petMood(fedAgo(2 * HOUR), noon)).toBe('froh');
    expect(petMood(fedAgo(5 * HOUR), noon)).toBe('normal');
    expect(petMood(fedAgo(10 * HOUR), noon)).toBe('hunger');
    expect(petMood(fedAgo(20 * HOUR), noon)).toBe('traurig');
    expect(petMood(fedAgo(30 * HOUR), noon)).toBe('krank');
    expect(petMood(fedAgo(48 * HOUR), noon)).toBe('tot');
  });

  it('schläft nachts, aber nicht beim Essen, krank oder tot', () => {
    const night = at(23, 30);
    const fed = (ms: number) => ({ born: 0, fed: night.getTime() - ms, meals: 1 });
    expect(petMood(fed(2 * HOUR), night)).toBe('schlaf');
    expect(petMood(fed(20_000), night)).toBe('essen');
    expect(petMood(fed(30 * HOUR), night)).toBe('krank');
    expect(petMood(fed(50 * HOUR), night)).toBe('tot');
  });
});

describe('Füttern, Alter und Countdown', () => {
  it('ein neues Ei ist satt genug und hat noch keine Mahlzeit', () => {
    const now = at(9).getTime();
    const egg = hatchPet(now);
    expect(egg.meals).toBe(0);
    expect(petMood(egg, at(9))).toBe('froh');
    const fed = feedPet(egg, now + 1000);
    expect(fed).toMatchObject({ fed: now + 1000, meals: 1, born: now });
    expect(petFullness(fed, now + 1000)).toBe(1);
    expect(petFullness(fed, now + 1000 + PET_LIMITS.hungerEnd * 2)).toBe(0);
  });

  it('zählt das Alter bis zum Tod', () => {
    const born = at(8).getTime();
    expect(petAge({ born, fed: born, meals: 0 }, born + 5.5 * HOUR)).toBe('5 Std.');
    expect(petAge({ born, fed: born + 24 * HOUR, meals: 2 }, born + 30 * HOUR)).toBe('1 Tag');
    const dead = { born, fed: born + 24 * HOUR, meals: 2 };
    expect(petDeathAt(dead)).toBe(born + 72 * HOUR);
    expect(petAge(dead, born + 500 * HOUR)).toBe('3 Tage');
  });

  it('formatiert Restzeit und Sekunden-Bild', () => {
    expect(countdown(23 * HOUR + 5 * 60_000 + 9_000)).toBe('23:05:09');
    expect(countdown(-5)).toBe('0:00:00');
    expect(petFrame(new Date(2026, 0, 1, 10, 0, 7))).toBe('07');
  });

  it('prüft gespeicherte Daten', () => {
    expect(parsePet({ born: 1, fed: 2, meals: 3.7 })).toEqual({ born: 1, fed: 2, meals: 3 });
    expect(parsePet({ born: 1 })).toBeNull();
    expect(parsePet('x')).toBeNull();
  });
});
