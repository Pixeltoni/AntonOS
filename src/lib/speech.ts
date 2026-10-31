/** Ein Ergebnis der Spracherkennung (Web Speech API) */
export interface SpeechResultLike {
  isFinal: boolean;
  0: { transcript: string };
}

/** Pause, nach der die Assistentin annimmt, dass der Satz fertig ist (ms) */
export const SILENCE_MS = 3000;
/** So lange wird auf den ersten Ton gewartet (ms) */
export const START_TIMEOUT_MS = 8000;
/** Höchstens so lange am Stück zuhören (ms) */
export const MAX_LISTEN_MS = 60_000;

/**
 * Text aus allen bisherigen Ergebnissen einer Sitzung – immer komplett neu gebaut,
 * weil manche Browser (iOS) Ergebnisse mehrfach melden.
 */
export function transcriptOf(results: ArrayLike<SpeechResultLike>): { final: string; interim: string } {
  let final = '';
  let interim = '';
  for (let i = 0; i < results.length; i++) {
    const r = results[i];
    if (r.isFinal) final = joinSpeech(final, r[0].transcript);
    else interim = joinSpeech(interim, r[0].transcript);
  }
  return { final, interim };
}

/** Teile zusammensetzen, ohne doppelte oder fehlende Leerzeichen */
export function joinSpeech(...parts: string[]): string {
  return parts.map((p) => p.trim()).filter(Boolean).join(' ');
}
