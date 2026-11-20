/** Countdowns für den Karten-Look: Wecker, nächster Termin, Satzpause. */

/** Restzeit als Uhr: „8:05:09“ ab einer Stunde, sonst „4:09“. Nie negativ. */
export function clockCountdown(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(s / 3600);
  const m = Math.floor(s / 60) % 60;
  const sec = String(s % 60).padStart(2, '0');
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${sec}` : `${m}:${sec}`;
}

/** Kurz in Worten: „in 3 Min.“, „in 2 Std. 5 Min.“, „in 3 Tagen“, „jetzt“. */
export function untilWords(ms: number): string {
  const min = Math.ceil(ms / 60_000);
  if (min <= 0) return 'jetzt';
  if (min < 60) return `in ${min} Min.`;
  const h = Math.floor(min / 60);
  if (h < 48) return min % 60 ? `in ${h} Std. ${min % 60} Min.` : `in ${h} Std.`;
  return `in ${Math.floor(h / 24)} Tagen`;
}
