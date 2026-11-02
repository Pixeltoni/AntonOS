import { wav } from './alarm';

/**
 * Eigenes Lied als Weckton: ein Ausschnitt von höchstens 29 Sekunden, denn länger spielt
 * das iPhone einen Weckton nicht. Mono und 22,05 kHz halten die Datei klein (~1,3 MB).
 */
export const CLIP_SECONDS = 29;
export const CLIP_RATE = 22050;

/** Dateiname des Ausschnitts in der iOS-App (Library/Sounds) */
export const clipFile = (alarmId: string) => `antonos-eigen-${alarmId.replace(/[^A-Za-z0-9_-]/g, '')}.wav`;

/** Spätester sinnvoller Start, damit der Ausschnitt noch voll lang ist */
export const maxClipStart = (duration: number) => Math.max(0, Math.floor(duration - CLIP_SECONDS));

/** Start auf den gültigen Bereich begrenzen (ganze Sekunden) */
export const clampClipStart = (start: number | undefined, duration: number) => Math.min(Math.max(0, Math.round(start ?? 0)), maxClipStart(duration));

/** 83 → „1:23“ */
export const mmss = (seconds: number) => `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, '0')}`;

/**
 * Ausschnitt ab `start` Sekunden: Kanäle zu Mono mischen, auf `outRate` umrechnen,
 * sanft ein- und ausblenden und auf einheitliche Lautstärke bringen.
 */
export function clipSamples(channels: Float32Array[], rate: number, start: number, seconds = CLIP_SECONDS, outRate = CLIP_RATE): Float32Array {
  const length = channels[0]?.length ?? 0;
  const from = Math.max(0, Math.min(Math.round(start * rate), length));
  const inCount = Math.min(length - from, Math.round(seconds * rate));
  const outCount = Math.max(0, Math.floor((inCount * outRate) / rate));
  const out = new Float32Array(outCount);
  if (outCount === 0 || channels.length === 0) return out;
  const step = rate / outRate;
  for (let i = 0; i < outCount; i++) {
    const pos = from + i * step;
    const j = Math.floor(pos);
    const f = pos - j;
    let sum = 0;
    for (const ch of channels) {
      const a = ch[j] ?? 0;
      const b = j + 1 < from + inCount ? ch[j + 1] : a;
      sum += a + (b - a) * f;
    }
    out[i] = sum / channels.length;
  }
  let peak = 0;
  for (const v of out) peak = Math.max(peak, Math.abs(v));
  const gain = peak > 0.001 ? 0.9 / peak : 1;
  const fadeIn = Math.min(outCount, Math.round(0.4 * outRate));
  const fadeOut = Math.min(outCount, Math.round(1.5 * outRate));
  for (let i = 0; i < outCount; i++) {
    const env = Math.min(1, i / fadeIn, (outCount - 1 - i) / fadeOut);
    out[i] *= gain * Math.max(0, env);
  }
  return out;
}

/** Ausschnitt als WAV-Datei */
export const clipWav = (channels: Float32Array[], rate: number, start: number) => wav(clipSamples(channels, rate, start), CLIP_RATE);
