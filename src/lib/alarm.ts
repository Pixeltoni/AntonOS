import type { Alarm, AlarmChallenge, SleepSettings, WakeLog } from '../types';
import { toDateStr } from './dates';
import { alarmSoundFile, DEFAULT_TONE } from './tones';

/** So lange nach der Weckzeit klingelt der Wecker noch, z. B. wenn das Handy kurz gesperrt war (ms) */
export const RING_GRACE = 10 * 60_000;
/** Nach „Ausschalten“: so viele Sekunden Zeit für die Aufgabe, bevor er wieder klingelt */
export const SOLVE_SECONDS = 15;
/** Beim QR-Code mehr Zeit – man muss erst zum Code laufen */
export const QR_SOLVE_SECONDS = 60;

/** Schütteln und Memory brauchen etwas länger (Folge ansehen, Handy greifen) */
export const solveSeconds = (challenge: AlarmChallenge) => (challenge === 'qr' ? QR_SOLVE_SECONDS : challenge === 'schuetteln' || challenge === 'memory' ? 30 : SOLVE_SECONDS);

export const CHALLENGES: { id: AlarmChallenge; label: string; hint: string }[] = [
  { id: 'rechnen', label: 'Rechnen', hint: 'Matheaufgaben lösen' },
  { id: 'text', label: 'Text', hint: 'Einen Satz fehlerfrei eingeben' },
  { id: 'qr', label: 'QR-Code', hint: 'Einen hinterlegten Code scannen, z. B. im Bad' },
  { id: 'schuetteln', label: 'Schütteln', hint: 'Das Handy kräftig schütteln' },
  { id: 'memory', label: 'Memory', hint: 'Eine Farbfolge merken und nachtippen' },
  { id: 'keine', label: 'Keine', hint: 'Einfach ausschalten' },
];

/** Muss man zum Abschalten etwas lösen? */
export const hasTask = (alarm: Pick<Alarm, 'challenge'>) => alarm.challenge !== 'keine';

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
  snooze: true,
  snoozeMinutes: 9,
  snoozeMax: 3,
  fadeIn: true,
  wakeCheck: false,
  wakeCheckMinutes: 5,
  morning: true,
  tone: DEFAULT_TONE,
});

export const SNOOZE_MINUTES = [5, 9, 10, 15];
export const WAKE_CHECK_MINUTES = [3, 5, 10];

/** Schlummer-Einstellungen mit Standardwerten (ältere Wecker: aus) */
export const snoozeOf = (a: Pick<Alarm, 'snooze' | 'snoozeMinutes' | 'snoozeMax'>) => ({
  on: !!a.snooze,
  minutes: Math.min(30, Math.max(1, a.snoozeMinutes ?? 9)),
  max: Math.min(10, Math.max(1, a.snoozeMax ?? 3)),
});

/** Darf nach `count`-mal Schlummern noch einmal geschlummert werden? */
export const canSnooze = (a: Pick<Alarm, 'snooze' | 'snoozeMinutes' | 'snoozeMax'>, count: number) => snoozeOf(a).on && count < snoozeOf(a).max;

/** 1 = Montag … 7 = Sonntag */
export const weekday = (d: Date) => ((d.getDay() + 6) % 7) + 1;

/** „HH:MM“ an einem Tag als Zeitpunkt */
function at(day: Date, time: string): Date {
  const [h, m] = time.split(':').map(Number);
  const d = new Date(day);
  d.setHours(h || 0, m || 0, 0, 0);
  return d;
}

/** Klingelt der Wecker an diesem Tag? Wochentage, festes Datum, Überspringen und Pause */
export function ringsOn(alarm: Pick<Alarm, 'days' | 'date' | 'skip' | 'pausedUntil'>, d: Date): boolean {
  const day = toDateStr(d);
  if (alarm.skip === day) return false;
  if (alarm.pausedUntil && day <= alarm.pausedUntil) return false;
  if (alarm.days.length > 0) return alarm.days.includes(weekday(d));
  return !alarm.date || alarm.date === day;
}

/** Die nächsten `count` Klingelzeitpunkte nach `now` (höchstens gut ein Jahr voraus) */
export function nextRings(alarm: Alarm, now: Date, count: number): Date[] {
  const out: Date[] = [];
  if (!alarm.enabled) return out;
  const once = alarm.days.length === 0;
  for (let i = 0; i <= 400 && out.length < count; i++) {
    const day = new Date(now);
    day.setDate(now.getDate() + i);
    const ring = at(day, alarm.time);
    if (ring > now && ringsOn(alarm, ring)) {
      out.push(ring);
      if (once) break;
    }
  }
  return out;
}

/** Nächster Zeitpunkt, an dem der Wecker klingelt (nach `now`), oder null, wenn er aus ist. */
export const nextRing = (alarm: Alarm, now: Date): Date | null => nextRings(alarm, now, 1)[0] ?? null;

/** Der nächste klingelnde Wecker */
export function nextAlarm(alarms: Alarm[], now: Date): { alarm: Alarm; at: Date } | null {
  let best: { alarm: Alarm; at: Date } | null = null;
  for (const alarm of alarms) {
    const ring = nextRing(alarm, now);
    if (ring && (!best || ring < best.at)) best = { alarm, at: ring };
  }
  return best;
}

/** Letzte Weckzeit (laut Uhrzeit) bis `atMs` – z. B. wann ein am iPhone gestoppter Wecker geklingelt hat (ms) */
export function previousRing(alarm: Pick<Alarm, 'time'>, atMs: number): number {
  const ref = new Date(atMs);
  for (const back of [0, 1]) {
    const day = new Date(ref);
    day.setDate(ref.getDate() - back);
    const ring = at(day, alarm.time).getTime();
    if (ring <= atMs) return ring;
  }
  return atMs;
}

/** „Nur den nächsten auslassen“: der Tag des nächsten Klingelns */
export function skipNext(alarm: Alarm, now: Date): Pick<Alarm, 'skip'> {
  const ring = nextRing({ ...alarm, skip: undefined }, now);
  return { skip: ring ? toDateStr(ring) : undefined };
}

/** Ist das Überspringen bzw. die Pause noch aktiv? */
export const isSkipping = (a: Alarm, now: Date) => !!a.skip && a.skip >= toDateStr(now);
export const isPaused = (a: Alarm, now: Date) => !!a.pausedUntil && a.pausedUntil >= toDateStr(now);

/** Schnellwecker in `minutes` Minuten, z. B. für einen Power-Nap */
export function quickAlarm(minutes: number, now: Date): Omit<Alarm, 'id'> {
  const ring = new Date(now.getTime() + minutes * 60_000);
  const hhmm = `${String(ring.getHours()).padStart(2, '0')}:${String(ring.getMinutes()).padStart(2, '0')}`;
  return { ...defaultAlarm(), time: hhmm, date: toDateStr(ring), days: [], label: `Power-Nap ${minutes} Min.`, challenge: 'keine', snooze: false, fadeIn: true, morning: false, armedAt: now.getTime() - 60_000 };
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

/** „Einmalig“ bzw. „Einmalig · Fr., 6. Nov.“ */
export function repeatLabel(a: Pick<Alarm, 'days' | 'date'>): string {
  if (a.days.length > 0 || !a.date) return daysLabel(a.days);
  const [y, m, d] = a.date.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('de-DE', { weekday: 'short', day: 'numeric', month: 'short' });
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

/* ---------- Schlaf ---------- */

export const defaultSleep = (): SleepSettings => ({ goal: 8 * 60, remind: false });
export const SLEEP_GOALS = [6 * 60, 6.5 * 60, 7 * 60, 7.5 * 60, 8 * 60, 8.5 * 60, 9 * 60];
/** So lange braucht man im Schnitt zum Einschlafen (Minuten) */
export const FALL_ASLEEP = 15;
/** Ein Schlafzyklus dauert etwa 90 Minuten */
export const CYCLE = 90;

/** „7 Std. 30 Min.“ */
export function durationLabel(minutes: number): string {
  const m = Math.max(0, Math.round(minutes));
  const h = Math.floor(m / 60);
  return `${h} Std.${m % 60 ? ` ${m % 60} Min.` : ''}`;
}

export const hhmm = (d: Date) => `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;

/** Wann man ins Bett muss, um vor dem Wecker `goal` Minuten zu schlafen */
export const bedtimeFor = (ring: Date, goal: number) => new Date(ring.getTime() - (goal + FALL_ASLEEP) * 60_000);

/** Weckzeiten am Ende eines Schlafzyklus, wenn man jetzt ins Bett geht (4½ bis 9 Std. Schlaf), auf 5 Min. gerundet */
export function cycleTimes(now: Date): { at: Date; cycles: number }[] {
  return [3, 4, 5, 6].map((cycles) => {
    const t = now.getTime() + (FALL_ASLEEP + cycles * CYCLE) * 60_000;
    return { at: new Date(Math.round(t / 300_000) * 300_000), cycles };
  });
}

/** Erinnerungen zur Schlafenszeit für die nächsten Tage (je Weckmorgen der früheste Wecker) */
export function bedtimeNotices(alarms: Alarm[], sleep: SleepSettings, now: Date, days = 7): { tag: string; at: number; title: string; body: string; href: string }[] {
  if (!sleep.remind) return [];
  const firstPerDay = new Map<string, Date>();
  for (const a of alarms) {
    for (const ring of nextRings(a, now, days + 1)) {
      const key = toDateStr(ring);
      const known = firstPerDay.get(key);
      if (!known || ring < known) firstPerDay.set(key, ring);
    }
  }
  const limit = now.getTime() + (days + 1) * 86_400_000;
  return [...firstPerDay.entries()]
    .map(([day, ring]) => ({ day, ring, bed: bedtimeFor(ring, sleep.goal) }))
    .filter((x) => x.bed.getTime() > now.getTime() && x.ring.getTime() <= limit)
    .sort((a, b) => a.bed.getTime() - b.bed.getTime())
    .map(({ day, ring, bed }) => ({
      tag: `schlafenszeit-${day}`,
      at: bed.getTime(),
      title: '🌙 Schlafenszeit',
      body: `Für ${durationLabel(sleep.goal)} Schlaf bis zum Wecker um ${hhmm(ring)}.`,
      href: '#/wecker',
    }));
}

/* ---------- Aufsteh-Statistik ---------- */

/** Pünktlich = nicht geschlummert und spätestens 10 Minuten nach dem Klingeln aus */
export const isPunctual = (l: Pick<WakeLog, 'snoozes' | 'ringAt' | 'offAt'>) => l.snoozes === 0 && l.offAt - l.ringAt <= 10 * 60_000;

export interface WakeStats {
  /** Durchschnittliche Aufstehzeit „HH:MM“ (letzte 14 Tage) */
  avgWake: string | null;
  /** Durchschnittlich geschlummert */
  avgSnoozes: number;
  /** Pünktliche Morgen in Folge (bis zum letzten) */
  streak: number;
  /** Letzte Tage (je Tag das erste Aufstehen), neueste zuerst */
  recent: WakeLog[];
}

export function wakeStats(logs: WakeLog[], now: Date): WakeStats {
  const byDay = new Map<string, WakeLog>();
  for (const l of [...logs].sort((a, b) => a.offAt - b.offAt)) if (!byDay.has(l.date)) byDay.set(l.date, l);
  const days = [...byDay.values()].sort((a, b) => b.date.localeCompare(a.date));
  const from = toDateStr(new Date(now.getTime() - 13 * 86_400_000));
  const recent = days.filter((l) => l.date >= from);
  let streak = 0;
  for (const l of days) {
    if (!isPunctual(l)) break;
    streak++;
  }
  const mins = recent.map((l) => {
    const d = new Date(l.offAt);
    return d.getHours() * 60 + d.getMinutes();
  });
  const avg = mins.length ? Math.round(mins.reduce((a, b) => a + b, 0) / mins.length) : null;
  return {
    avgWake: avg === null ? null : `${String(Math.floor(avg / 60)).padStart(2, '0')}:${String(avg % 60).padStart(2, '0')}`,
    avgSnoozes: recent.length ? Math.round((recent.reduce((a, l) => a + l.snoozes, 0) / recent.length) * 10) / 10 : 0,
    streak,
    recent,
  };
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

/** Memory: Länge der Farbfolge je Schwierigkeit */
export const memoryLength = (level: 1 | 2 | 3) => (level === 1 ? 4 : level === 2 ? 6 : 8);

/** Zufällige Folge aus 4 Feldern, nie zweimal dasselbe direkt hintereinander */
export function memorySequence(length: number, rnd: () => number = Math.random): number[] {
  const out: number[] = [];
  while (out.length < length) {
    const n = Math.floor(rnd() * 4);
    if (n !== out.at(-1)) out.push(n);
  }
  return out;
}

/** Schütteln: Anzahl je Schwierigkeit */
export const shakeTarget = (level: 1 | 2 | 3) => (level === 1 ? 15 : level === 2 ? 30 : 50);

/** Zählt kräftige Bewegungen aus Beschleunigungswerten (m/s², mit Schwerkraft) */
export class ShakeCounter {
  count = 0;
  private last = -Infinity;
  /** Ab dieser Stärke zählt eine Bewegung (gut 2 g) */
  constructor(private threshold = 22, private gap = 250) {}
  feed(x: number, y: number, z: number, t: number): number {
    const force = Math.sqrt(x * x + y * y + z * z);
    if (force >= this.threshold && t - this.last >= this.gap) {
      this.count++;
      this.last = t;
    }
    return this.count;
  }
}

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

/** Sanft lauter: Lautstärke (0…1) nach `elapsed` ms – von 10 % auf 100 % in `duration` ms */
export const fadeVolume = (elapsed: number, duration = 45_000, start = 0.1) => Math.min(1, start + (1 - start) * Math.max(0, elapsed) / duration);

/** Eine stille Viertelsekunde – zum Freischalten der Wiedergabe auf dem iPhone */
export const silence = (rate = 8000) => wav(new Float32Array(rate / 4), rate);

/* ---------- Echter Wecker in der iOS-App (AlarmKit) ---------- */

export interface NativeAlarm {
  id: string;
  title: string;
  hour: number;
  minute: number;
  /** 1 = Montag … 7 = Sonntag; leer = einmalig */
  days: number[];
  /** false = „Stopp“ schaltet ihn einfach aus */
  task: boolean;
  /** Fester Zeitpunkt (ms) statt Uhrzeit – bei festem Datum, Überspringen oder Pause */
  at?: number;
  /** Schlummern: Dauer in Sekunden und höchste Anzahl */
  snooze?: number;
  snoozeMax?: number;
  /** Weckton-Datei(en), mit „|“ getrennt: die erste vorhandene klingelt */
  sound?: string;
}

/** So viele einzelne Termine werden vorab gestellt, wenn sich der Wecker nicht als Wochenplan stellen lässt */
export const NATIVE_FIXED = 14;

export const alarmTitle = (alarm: Pick<Alarm, 'label'>) => alarm.label.trim() || 'Wecker';

/**
 * Eingeschaltete Wecker im Format für das iPhone. Wecker mit festem Datum, Überspringen
 * oder Pause gehen als einzelne Termine (die nächsten `NATIVE_FIXED`) – AlarmKit kennt
 * keine Ausnahmen im Wochenplan.
 */
export function nativeAlarms(alarms: Alarm[], now = new Date()): NativeAlarm[] {
  const out: NativeAlarm[] = [];
  for (const a of alarms) {
    if (!a.enabled || !/^\d\d:\d\d$/.test(a.time)) continue;
    const [hour, minute] = a.time.split(':').map(Number);
    const s = snoozeOf(a);
    const base: NativeAlarm = { id: a.id, title: alarmTitle(a), hour, minute, days: [...new Set(a.days)].filter((d) => d >= 1 && d <= 7).sort(), task: hasTask(a), sound: alarmSoundFile(a) };
    if (s.on) Object.assign(base, { snooze: s.minutes * 60, snoozeMax: s.max });
    const special = (a.days.length === 0 && !!a.date) || isSkipping(a, now) || isPaused(a, now);
    if (!special) {
      out.push(base);
      continue;
    }
    for (const ring of nextRings(a, now, a.days.length === 0 ? 1 : NATIVE_FIXED)) out.push({ ...base, days: [], at: ring.getTime() });
  }
  return out.sort((x, y) => x.id.localeCompare(y.id) || (x.at ?? 0) - (y.at ?? 0));
}

/**
 * Wie lange das iPhone nach „Stopp“ still bleibt, bevor es wieder klingelt.
 * Während der Aufgabe: Restzeit plus Puffer, damit das offene AntonOS zuerst klingelt.
 */
export const nativeRingAgainSeconds = (phase: 'klingelt' | 'aufgabe' | 'schlummert', secondsLeft: number) =>
  phase === 'aufgabe' ? Math.max(0, secondsLeft) + 15 : phase === 'schlummert' ? Math.max(5, secondsLeft) : 30;

/**
 * Einmalige Wecker, deren Weckzeit seit dem Einschalten schon vorbei ist – das iPhone hat sie
 * bereits geklingelt, sie werden ausgeschaltet (sonst würde er am nächsten Tag erneut gestellt).
 */
export function expiredOneShots(alarms: Alarm[], now: Date): Alarm[] {
  return alarms.filter((a) => {
    if (!a.enabled || a.days.length > 0) return false;
    const ring = nextRing(a, new Date(a.armedAt));
    return !!ring && ring <= now;
  });
}
