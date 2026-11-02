import type { Alarm } from '../types';
import { wav } from './alarm';
import { clipFile } from './clip';

/** Eigene Wecktöne – im Browser erzeugt, für die iOS-App als WAV-Dateien mitgeliefert (scripts/tones.ts) */
export type ToneId = 'klassisch' | 'puls' | 'glocke' | 'marimba' | 'aufgang' | 'digital';

export const TONES: { id: ToneId; label: string; hint: string }[] = [
  { id: 'aufgang', label: 'Sonnenaufgang', hint: 'Sanfte, steigende Melodie' },
  { id: 'marimba', label: 'Marimba', hint: 'Weiche Holztöne' },
  { id: 'glocke', label: 'Glocke', hint: 'Klare Glockenschläge' },
  { id: 'puls', label: 'Puls', hint: 'Helle, schnelle Impulse' },
  { id: 'digital', label: 'Digital', hint: 'Wie ein alter Digitalwecker' },
  { id: 'klassisch', label: 'Klassisch', hint: 'Lauter Piepton' },
];

/**
 * Antons eigene Lieder als feste Wecktöne (je 29 Sekunden, im App-Paket). Sie liegen verschlüsselt
 * in ios/eigene-toene.tar.gz.enc – nicht öffentlich – und kommen nur beim iOS-Build in die App.
 * Im Browser klingelt stattdessen der Standardton.
 */
export type SongId = 'lied-whatoncewas';
export const SONGS: { id: SongId; label: string; hint: string }[] = [
  { id: 'lied-whatoncewas', label: 'What Once Was', hint: 'Her’s' },
];

export const DEFAULT_TONE: ToneId = 'aufgang';

export const isSong = (id: string | undefined): id is SongId => SONGS.some((s) => s.id === id);

/** Gültiger Ton (Weckton oder Lied), sonst der Standard */
export const toneOf = (id: string | undefined): ToneId | SongId => (TONES.some((t) => t.id === id) || isSong(id) ? (id as ToneId | SongId) : DEFAULT_TONE);

/** Name in der Liste */
export const toneLabel = (id: string | undefined) => {
  const t = toneOf(id);
  return [...TONES, ...SONGS].find((x) => x.id === t)?.label ?? 'Weckton';
};

/** Im Browser erzeugbarer Ton: Lieder spielen dort den Standardton */
export const synthTone = (id: string | undefined): ToneId => {
  const t = toneOf(id);
  return isSong(t) ? DEFAULT_TONE : t;
};

/** Dateiname in der iOS-App (liegt im App-Paket) */
export const toneFile = (id: string | undefined) => `antonos-${toneOf(id)}.wav`;

/**
 * Ton fürs iPhone: beim eigenen Lied zuerst der Ausschnitt, sonst der Weckton.
 * Mehrere Namen mit „|“ – die App nimmt den ersten, den es auf dem Gerät gibt.
 */
export const alarmSoundFile = (a: Pick<Alarm, 'id' | 'sound' | 'tone'>) => (a.sound === 'datei' ? `${clipFile(a.id)}|${toneFile(a.tone)}` : toneFile(a.tone));

/** Länge der Datei für das iPhone – AlarmKit spielt höchstens 30 Sekunden */
export const NATIVE_TONE_SECONDS = 29;

const RATE = 16000;
const TAU = Math.PI * 2;
const note = (semitonesFromA4: number) => 440 * 2 ** (semitonesFromA4 / 12);

type Voice = (t: number) => number;

/** Ein Ton ab `start` (s): Hüllkurve mit kurzem Anstieg und exponentiellem Abklingen */
function hit(out: Float32Array, rate: number, start: number, length: number, decay: number, voice: Voice, gain = 1, attack = 0.004) {
  const from = Math.round(start * rate);
  const n = Math.round(length * rate);
  for (let i = 0; i < n && from + i < out.length; i++) {
    const t = i / rate;
    const env = Math.min(1, t / attack) * Math.exp(-t / decay) * Math.min(1, (length - t) / 0.01);
    out[from + i] += gain * env * voice(t);
  }
}

const sine = (f: number): Voice => (t) => Math.sin(TAU * f * t);
const square = (f: number): Voice => (t) => (Math.sin(TAU * f * t) >= 0 ? 1 : -1);

/** Eine Schleife (Periode) des Tons, Werte zwischen -1 und 1 */
export function toneLoop(id: ToneId, rate = RATE): Float32Array {
  let out: Float32Array;
  switch (id) {
    case 'klassisch': {
      out = new Float32Array(rate);
      for (let b = 0; b < 4; b++) hit(out, rate, b * 0.14, 0.09, 10, square(2000), 0.55, 0.005);
      break;
    }
    case 'digital': {
      out = new Float32Array(rate);
      for (let b = 0; b < 2; b++) hit(out, rate, b * 0.2, 0.12, 10, square(2600), 0.42, 0.003);
      break;
    }
    case 'puls': {
      out = new Float32Array(Math.round(rate * 0.9));
      for (let b = 0; b < 3; b++) hit(out, rate, b * 0.11, 0.07, 0.05, sine(1568), 0.9, 0.002);
      break;
    }
    case 'glocke': {
      out = new Float32Array(Math.round(rate * 2));
      const bell = (f: number): Voice => (t) => Math.sin(TAU * f * t) + 0.5 * Math.sin(TAU * f * 2.76 * t) * Math.exp(-t * 3) + 0.25 * Math.sin(TAU * f * 5.4 * t) * Math.exp(-t * 6);
      hit(out, rate, 0, 1, 0.45, bell(note(3)), 0.45);
      hit(out, rate, 0.5, 1.4, 0.55, bell(note(-2)), 0.45);
      break;
    }
    case 'marimba': {
      out = new Float32Array(Math.round(rate * 1.6));
      const wood = (f: number): Voice => (t) => Math.sin(TAU * f * t) + 0.35 * Math.sin(TAU * f * 4 * t) * Math.exp(-t * 25);
      [3, 7, 10, 7, 15].forEach((s, i) => hit(out, rate, i * 0.2, 0.5, 0.14, wood(note(s)), 0.6));
      break;
    }
    case 'aufgang':
    default: {
      out = new Float32Array(Math.round(rate * 2.4));
      const soft = (f: number): Voice => (t) => Math.sin(TAU * f * t) + 0.3 * Math.sin(TAU * f * 2 * t);
      [3, 7, 10, 15, 19].forEach((s, i) => hit(out, rate, i * 0.22, 1.1, 0.35, soft(note(s)), 0.4, 0.02));
      break;
    }
  }
  // Auf einheitliche Lautstärke bringen
  let peak = 0;
  for (const v of out) peak = Math.max(peak, Math.abs(v));
  if (peak > 0) for (let i = 0; i < out.length; i++) out[i] = (out[i] / peak) * 0.8;
  return out;
}

/** Ton als WAV: eine Schleife oder auf `seconds` wiederholt */
export function toneWav(id: ToneId, seconds?: number, rate = RATE): Uint8Array {
  const loop = toneLoop(id, rate);
  if (!seconds) return wav(loop, rate);
  const total = Math.round(seconds * rate);
  const out = new Float32Array(total);
  for (let i = 0; i < total; i++) out[i] = loop[i % loop.length];
  // Ende kurz ausblenden, damit es nicht knackt
  const fade = Math.round(0.05 * rate);
  for (let i = 0; i < fade; i++) out[total - 1 - i] *= i / fade;
  return wav(out, rate);
}
