/** Bewegungen ohne React: Kurven und Zwischenwerte für hochzählende Zahlen. */

/** Startet schnell und läuft weich aus (wie die Federkurven in iOS). */
export const easeOutQuart = (p: number): number => 1 - Math.pow(1 - clamp01(p), 4);

const clamp01 = (p: number) => (Number.isFinite(p) ? Math.min(1, Math.max(0, p)) : 1);

/** Wert zwischen `from` und `to` nach `elapsed` von `duration` Millisekunden. */
export function tween(from: number, to: number, elapsed: number, duration: number): number {
  if (duration <= 0 || elapsed >= duration) return to;
  return from + (to - from) * easeOutQuart(elapsed / duration);
}

/** Kürzere Dauer für kleine Sprünge, damit „3 → 4“ nicht 1,5 s lang zählt. */
export function countDuration(from: number, to: number): number {
  const diff = Math.abs(to - from);
  if (diff === 0) return 0;
  return Math.round(Math.min(1400, 450 + Math.log10(diff + 1) * 350));
}

/** Verzögerung für nacheinander erscheinende Kacheln – gedeckelt, damit lange Listen nicht warten. */
export const staggerDelay = (index: number, step = 45, max = 540): number => Math.min(Math.max(0, index) * step, max);
