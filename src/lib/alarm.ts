import type { Alarm, AlarmChallenge } from '../types';
import { toDateStr } from './dates';

/** So lange nach der Weckzeit klingelt der Wecker noch, z. B. wenn das Handy kurz gesperrt war (ms) */
export const RING_GRACE = 10 * 60_000;
/** Nach „Ausschalten“: so viele Sekunden Zeit für die Aufgabe, bevor er wieder klingelt */
export const SOLVE_SECONDS = 15;
/** Beim QR-Code mehr Zeit – man muss erst zum Code laufen */
export const QR_SOLVE_SECONDS = 60;

export const solveSeconds = (challenge: AlarmChallenge) => (challenge === 'qr' ? QR_SOLVE_SECONDS : SOLVE_SECONDS);

export const CHALLENGES: { id: AlarmChallenge; label: string; hint: string }[] = [
  { id: 'rechnen', label: 'Rechnen', hint: 'Matheaufgaben lösen' },
  { id: 'text', label: 'Text abtippen', hint: 'Einen Satz fehlerfrei eingeben' },
  { id: 'qr', label: 'QR-Code scannen', hint: 'Einen hinterlegten Code scannen, z. B. im Bad' },
];

export const WEEKDAYS = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'];

export const defaultAlarm = (): Omit<Alarm, 'id'> => ({
  time: '07:00',
  label: '',
  days: [1, 2, 3, 4, 5],
  enabled: true,
  armedAt: Date.now(),
  sound: 'ton',
  soundUrl: '',
  challenge: 'rechnen',
  level: 2,
  rounds: 3,
  phrase: '',
  qr: '',
});

/** 1 = Montag … 7 = Sonntag */
export const weekday = (d: Date) => ((d.getDay() + 6) % 7) + 1;

/** „HH:MM“ an einem Tag als Zeitpunkt */
function at(day: Date, time: string): Date {
  const [h, m] = time.split(':').map(Number);
  const d = new Date(day);
  d.setHours(h || 0, m || 0, 0, 0);
  return d;
}

const ringsOn = (alarm: Alarm, d: Date) => alarm.days.length === 0 || alarm.days.includes(weekday(d));

/** Nächster Zeitpunkt, an dem der Wecker klingelt (nach `now`), oder null, wenn er aus ist. */
export function nextRing(alarm: Alarm, now: Date): Date | null {
  if (!alarm.enabled) return null;
  for (let i = 0; i <= 7; i++) {
    const day = new Date(now);
    day.setDate(now.getDate() + i);
    const ring = at(day, alarm.time);
    if (ring > now && ringsOn(alarm, ring)) return ring;
  }
  return null;
}

/** Eindeutige Kennung eines Klingelns – damit jeder Termin nur einmal klingelt */
export const ringKey = (alarm: Alarm, ring: Date) => `${alarm.id}@${toDateStr(ring)} ${alarm.time}`;

/**
 * Wecker, die jetzt klingeln sollen: Weckzeit erreicht, höchstens `RING_GRACE` her,
 * nach dem Einschalten (`armedAt`) und noch nicht geklingelt.
 */
export function dueAlarms(alarms: Alarm[], now: Date, fired: string[]): { alarm: Alarm; key: string }[] {
  const out: { alarm: Alarm; key: string }[] = [];
  for (const alarm of alarms) {
    if (!alarm.enabled) continue;
    // Heute und gestern prüfen (Weckzeit kurz vor Mitternacht)
    for (const back of [0, 1]) {
      const day = new Date(now);
      day.setDate(now.getDate() - back);
      const ring = at(day, alarm.time);
      const since = now.getTime() - ring.getTime();
      if (since < 0 || since > RING_GRACE || ring.getTime() < alarm.armedAt || !ringsOn(alarm, ring)) continue;
      const key = ringKey(alarm, ring);
      if (!fired.includes(key)) out.push({ alarm, key });
    }
  }
  return out;
}

/** „Täglich“, „Werktags“, „Mo, Mi, Fr“ … */
export function daysLabel(days: number[]): string {
  const set = [...new Set(days)].sort();
  if (set.length === 0) return 'Einmalig';
  if (set.length === 7) return 'Täglich';
  if (set.join() === '1,2,3,4,5') return 'Werktags';
  if (set.join() === '6,7') return 'Wochenende';
  return set.map((d) => WEEKDAYS[d - 1]).join(', ');
}

/** „in 7 Std. 5 Min.“ */
export function untilLabel(ring: Date, now: Date): string {
  const min = Math.max(1, Math.ceil((ring.getTime() - now.getTime()) / 60_000));
  const h = Math.floor(min / 60);
  const m = min % 60;
  if (h === 0) return `in ${m} Min.`;
  if (h >= 24) return `in ${Math.floor(h / 24)} T. ${h % 24} Std.`;
  return `in ${h} Std.${m ? ` ${m} Min.` : ''}`;
}

/* ---------- Aufgaben ---------- */

export interface MathProblem {
  question: string;
  answer: number;
}

const int = (rnd: () => number, min: number, max: number) => min + Math.floor(rnd() * (max - min + 1));

/** Rechenaufgabe: 1 = leicht (Plus), 2 = mittel (Mal plus Zahl), 3 = schwer (zweistellig mal zweistellig) */
export function mathProblem(level: 1 | 2 | 3, rnd: () => number = Math.random): MathProblem {
  if (level === 1) {
    const a = int(rnd, 12, 59);
    const b = int(rnd, 11, 39);
    return { question: `${a} + ${b}`, answer: a + b };
  }
  if (level === 2) {
    const a = int(rnd, 3, 9);
    const b = int(rnd, 6, 19);
    const c = int(rnd, 11, 49);
    return { question: `${a} × ${b} + ${c}`, answer: a * b + c };
  }
  const a = int(rnd, 12, 39);
  const b = int(rnd, 12, 29);
  return { question: `${a} × ${b}`, answer: a * b };
}

export const isCorrectNumber = (problem: MathProblem, input: string) => input.trim() !== '' && Number(input.trim()) === problem.answer;

export const PHRASES = [
  'Ich stehe jetzt auf und starte gut in den Tag',
  'Heute wird ein guter Tag, weil ich früh anfange',
  'Wer früh aufsteht, hat mehr vom Tag',
  'Erst ein Glas Wasser, dann geht es los',
  'Ich bin wach und bleibe auch wach',
  'Der frühe Vogel fängt den Wurm',
];

export const randomPhrase = (rnd: () => number = Math.random) => PHRASES[Math.floor(rnd() * PHRASES.length)];

/** Leerzeichen und Groß-/Kleinschreibung egal (Autokorrektur am Handy), sonst muss alles stimmen. */
const squash = (s: string) => s.trim().replace(/\s+/g, ' ').toLocaleLowerCase('de');
export const isCorrectPhrase = (expected: string, input: string) => squash(expected) !== '' && squash(expected) === squash(input);

/* ---------- Klänge ---------- */

/** Video-ID aus einem YouTube-Link (watch, youtu.be, shorts, music, embed) */
export function youtubeId(raw: string): string | null {
  let u: URL;
  try {
    u = new URL(raw.trim());
  } catch {
    return null;
  }
  const host = u.hostname.replace(/^(www|m|music)\./, '');
  let id: string | null = null;
  if (host === 'youtu.be') id = u.pathname.slice(1).split('/')[0];
  else if (host === 'youtube.com' || host === 'youtube-nocookie.com') {
    const [first, second] = u.pathname.split('/').filter(Boolean);
    id = first === 'watch' || !first ? u.searchParams.get('v') : ['shorts', 'embed', 'live'].includes(first) ? second ?? null : null;
  }
  return id && /^[A-Za-z0-9_-]{11}$/.test(id) ? id : null;
}

/** Spotify-Link als URI: Playlist/Album/Künstler als Kontext, Song als einzelner Titel */
export function spotifyUri(raw: string): { uri: string; kind: 'context' | 'track' } | null {
  const m = raw.trim().match(/^spotify:(track|playlist|album|artist):([A-Za-z0-9]+)$/);
  if (m) return { uri: raw.trim(), kind: m[1] === 'track' ? 'track' : 'context' };
  let u: URL;
  try {
    u = new URL(raw.trim());
  } catch {
    return null;
  }
  if (u.hostname !== 'open.spotify.com') return null;
  const [type, id] = u.pathname.split('/').filter(Boolean).filter((p) => !p.startsWith('intl-') && p !== 'embed');
  if (!['track', 'playlist', 'album', 'artist'].includes(type) || !/^[A-Za-z0-9]+$/.test(id ?? '')) return null;
  return { uri: `spotify:${type}:${id}`, kind: type === 'track' ? 'track' : 'context' };
}

/** 16-Bit-Mono-WAV aus Samples zwischen -1 und 1 */
export function wav(samples: Float32Array, rate: number): Uint8Array {
  const out = new Uint8Array(44 + samples.length * 2);
  const v = new DataView(out.buffer);
  const text = (at: number, s: string) => [...s].forEach((c, i) => v.setUint8(at + i, c.charCodeAt(0)));
  text(0, 'RIFF');
  v.setUint32(4, 36 + samples.length * 2, true);
  text(8, 'WAVE');
  text(12, 'fmt ');
  v.setUint32(16, 16, true);
  v.setUint16(20, 1, true);
  v.setUint16(22, 1, true);
  v.setUint32(24, rate, true);
  v.setUint32(28, rate * 2, true);
  v.setUint16(32, 2, true);
  v.setUint16(34, 16, true);
  text(36, 'data');
  v.setUint32(40, samples.length * 2, true);
  samples.forEach((s, i) => v.setInt16(44 + i * 2, Math.max(-1, Math.min(1, s)) * 0x7fff, true));
  return out;
}

/** Klassischer Weckton: viermal kurz piepen, dann Pause (eine Sekunde, zum Wiederholen) */
export function alarmTone(rate = 16000): Uint8Array {
  const samples = new Float32Array(rate);
  const beep = 0.09 * rate;
  for (let b = 0; b < 4; b++) {
    const start = Math.round(b * 0.14 * rate);
    for (let i = 0; i < beep; i++) {
      const fade = Math.min(1, i / 80, (beep - i) / 80);
      samples[start + i] = 0.55 * fade * Math.sign(Math.sin((2 * Math.PI * 2000 * i) / rate));
    }
  }
  return wav(samples, rate);
}

/** Eine stille Viertelsekunde – zum Freischalten der Wiedergabe auf dem iPhone */
export const silence = (rate = 8000) => wav(new Float32Array(rate / 4), rate);
