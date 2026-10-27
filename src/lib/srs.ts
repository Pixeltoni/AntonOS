import type { Card, DateStr } from '../types';
import { addDays } from './dates';

export type Rating = 'nochmal' | 'schwer' | 'gut' | 'leicht';

export const MIN_EASE = 1.3;
export const START_EASE = 2.5;

/**
 * Plant die nächste Wiederholung einer Lernkarte nach einer vereinfachten
 * SM-2-Variante (ähnlich Anki).
 */
export function review(card: Card, rating: Rating, on: DateStr): Card {
  let { interval, ease, reps, lapses } = card;

  if (rating === 'nochmal') {
    reps = 0;
    lapses += 1;
    interval = 1;
    ease = Math.max(MIN_EASE, ease - 0.2);
  } else {
    if (reps === 0) {
      interval = rating === 'leicht' ? 4 : 1;
    } else if (reps === 1) {
      interval = rating === 'schwer' ? 3 : rating === 'gut' ? 6 : 8;
    } else if (rating === 'schwer') {
      interval = Math.max(interval + 1, Math.round(interval * 1.2));
    } else if (rating === 'gut') {
      interval = Math.max(interval + 1, Math.round(interval * ease));
    } else {
      interval = Math.max(interval + 1, Math.round(interval * ease * 1.3));
    }
    if (rating === 'schwer') ease = Math.max(MIN_EASE, ease - 0.15);
    if (rating === 'leicht') ease += 0.15;
    reps += 1;
  }

  return { ...card, interval, ease: Math.round(ease * 100) / 100, reps, lapses, due: addDays(on, interval) };
}

export function isDue(card: Card, on: DateStr): boolean {
  return card.due <= on;
}
