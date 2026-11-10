import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { createPortal } from 'react-dom';
import { useStore } from '../store';
import type { Alarm } from '../types';
import { previousRing, alarmTitle, bedtimeNotices, canSnooze, defaultAlarm, defaultSleep, dueAlarms, expiredOneShots, fadeVolume, hasTask, hhmm, memoryLength, memorySequence, nativeAlarms, nativeRingAgainSeconds, isCorrectNumber, isCorrectPhrase, mathProblem, randomPhrase, ShakeCounter, shakeTarget, silence, snoozeOf, solveSeconds, spotifyUri, youtubeId } from '../lib/alarm';
import { alarmSoundFile, isSong, synthTone, toneFile, toneOf, toneWav } from '../lib/tones';
import { clampClipStart, CLIP_SECONDS, clipFile, clipWav } from '../lib/clip';
import { today } from '../lib/dates';
import { MorningBrief } from './morning';
import { useRoutine } from './routine';
import { api, pickDevice, type Device } from '../lib/spotify';
import { isMobile, notify } from '../lib/notify';
import { useSpotify } from './spotify';
import { App as NativeApp } from '@capacitor/app';
import { AntonAlarm, isNativeApp, nativeAlarmPermission, type AlarmPermission } from '../lib/native';

/* ---------- Eigene Audiodateien: nur auf diesem Gerät (IndexedDB), zu groß für Sync ---------- */

const DB_NAME = 'antonos-wecker';
const STORE = 'toene';

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function withStore<T>(mode: IDBTransactionMode, run: (s: IDBObjectStore) => IDBRequest): Promise<T> {
  const db = await openDb();
  return new Promise<T>((resolve, reject) => {
    const req = run(db.transaction(STORE, mode).objectStore(STORE));
    req.onsuccess = () => resolve(req.result as T);
    req.onerror = () => reject(req.error);
  }).finally(() => db.close());
}

export const saveSoundFile = (alarmId: string, file: Blob) => withStore<void>('readwrite', (s) => s.put(file, alarmId));
export const loadSoundFile = (alarmId: string) => withStore<Blob | undefined>('readonly', (s) => s.get(alarmId));
export const deleteSoundFile = (alarmId: string) => withStore<void>('readwrite', (s) => s.delete(alarmId)).catch(() => undefined);

/* ---------- Wiedergabe über ein einziges Audio-Element ---------- */

// Ein <audio>-Element klingt auf dem iPhone auch im Lautlos-Modus (Web Audio nicht).
// Einmal per Tippen gestartet, darf es später ohne Tippen wieder spielen.
let element: HTMLAudioElement | null = null;
const audio = () => (element ??= Object.assign(new Audio(), { preload: 'auto' }));

/** Abspielbare Adresse je Weckton (eine Schleife, wird wiederholt) */
const toneSrcs = new Map<string, string>();
const synth = (id: string | undefined) => {
  const t = synthTone(id);
  let src = toneSrcs.get(t);
  if (!src) toneSrcs.set(t, (src = URL.createObjectURL(new Blob([toneWav(t)], { type: 'audio/wav' }))));
  return src;
};
/** Lieder liegen nur in der iOS-App (beim Build eingefügt), sonst der erzeugte Ton */
const tone = (id: string | undefined) => {
  const t = toneOf(id);
  return isSong(t) && isNativeApp() ? `tones/${toneFile(t)}` : synth(t);
};
let silentSrc: string | null = null;

/** Muss aus einem Tippen heraus aufgerufen werden: schaltet die Wiedergabe für später frei. */
export function unlockAlarmAudio() {
  const el = audio();
  if (!el.paused) return;
  el.src = (silentSrc ??= URL.createObjectURL(new Blob([silence()], { type: 'audio/wav' })));
  el.loop = false;
  el.play().then(() => el.pause()).catch(() => undefined);
}

function playLocal(src: string, volume = 1) {
  const el = audio();
  if (el.src !== src) el.src = src;
  el.loop = true;
  el.currentTime = 0;
  el.volume = volume;
  return el.play();
}

const stopLocal = () => element?.pause();

let previewTimer = 0;
/** Ton kurz vorhören (aus einem Tippen heraus aufrufen) */
export function previewTone(id: string) {
  clearTimeout(previewTimer);
  playLocal(tone(id)).catch(() => undefined);
  previewTimer = window.setTimeout(stopLocal, isSong(id) ? 8000 : 3500);
}

/* ---------- Eigenes Lied: Ausschnitt als Weckton fürs iPhone ---------- */

async function decodeAudio(blob: Blob): Promise<AudioBuffer> {
  const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
  const ctx = new Ctx();
  try {
    return await ctx.decodeAudioData(await blob.arrayBuffer());
  } finally {
    void ctx.close().catch(() => undefined);
  }
}

/** Länge eines Lieds in Sekunden (0, wenn es sich nicht lesen lässt) */
export function audioDuration(blob: Blob): Promise<number> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(blob);
    const el = new Audio();
    const done = (d: number) => {
      URL.revokeObjectURL(url);
      resolve(Number.isFinite(d) ? d : 0);
    };
    el.preload = 'metadata';
    el.onloadedmetadata = () => done(el.duration);
    el.onerror = () => done(0);
    el.src = url;
  });
}

function toBase64(bytes: Uint8Array): string {
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}

/** iOS-App: Ausschnitt ab `start` als Weckton speichern, damit er am gesperrten iPhone klingelt */
export async function saveNativeClip(alarmId: string, blob: Blob, start: number): Promise<void> {
  const buffer = await decodeAudio(blob);
  const channels = Array.from({ length: buffer.numberOfChannels }, (_, i) => buffer.getChannelData(i));
  const bytes = clipWav(channels, buffer.sampleRate, clampClipStart(start, buffer.duration));
  await AntonAlarm.saveSound({ name: clipFile(alarmId), data: toBase64(bytes) });
  window.dispatchEvent(new Event(SOUND_EVENT));
}

export const removeNativeClip = (alarmId: string) => (isNativeApp() ? AntonAlarm.removeSound({ name: clipFile(alarmId) }).catch(() => undefined) : Promise.resolve());

let previewUrl = '';
/** Ausschnitt eines Lieds kurz vorhören (aus einem Tippen heraus aufrufen) */
export function previewClip(blob: Blob, start: number) {
  clearTimeout(previewTimer);
  if (previewUrl) URL.revokeObjectURL(previewUrl);
  previewUrl = URL.createObjectURL(blob);
  const el = audio();
  el.src = previewUrl;
  el.loop = false;
  el.volume = 1;
  el.currentTime = start;
  el.play().catch(() => undefined);
  previewTimer = window.setTimeout(stopLocal, 8000);
}

/* ---------- YouTube (IFrame-API) ---------- */

interface YTPlayer {
  playVideo(): void;
  pauseVideo(): void;
  seekTo(s: number): void;
  getPlayerState(): number;
  setVolume(v: number): void;
  destroy(): void;
}
interface YTNamespace {
  Player: new (el: HTMLElement, opts: { videoId: string; width: number; height: number; playerVars: Record<string, number | string>; events: Record<string, (e: { target: YTPlayer; data: number }) => void> }) => YTPlayer;
}
declare global {
  interface Window {
    YT?: YTNamespace;
    onYouTubeIframeAPIReady?: () => void;
  }
}

let ytApi: Promise<YTNamespace> | null = null;
function loadYouTube(): Promise<YTNamespace> {
  if (window.YT?.Player) return Promise.resolve(window.YT);
  return (ytApi ??= new Promise((resolve, reject) => {
    window.onYouTubeIframeAPIReady = () => resolve(window.YT!);
    const s = document.createElement('script');
    s.src = 'https://www.youtube.com/iframe_api';
    s.onerror = () => {
      ytApi = null;
      reject(new Error('YouTube nicht erreichbar'));
    };
    document.head.appendChild(s);
  }));
}

/* ---------- Spotify ---------- */

/** Spielt Song oder Playlist auf dem aktiven Spotify-Gerät, sonst bevorzugt auf einem Handy */
async function startSpotify(clientId: string, link: string) {
  const target = spotifyUri(link);
  if (!target) throw new Error('Ungültiger Spotify-Link');
  const res = await api<{ devices: Device[] }>(clientId, '/me/player/devices');
  const device = pickDevice(res?.devices ?? [], true);
  if (!device) throw new Error('Kein Spotify-Gerät gefunden');
  const body = target.kind === 'track' ? { uris: [target.uri] } : { context_uri: target.uri };
  await api(clientId, `/me/player/play?device_id=${device.id}`, { method: 'PUT', body: JSON.stringify(body) });
  return { id: device.id!, volume: device.volume_percent ?? null };
}

/** Spotify-Lautstärke setzen – manche Geräte (z. B. das iPhone) erlauben das nicht, dann passiert nichts */
const spotifyVolume = (clientId: string, device: string, percent: number) =>
  api(clientId, `/me/player/volume?volume_percent=${Math.round(Math.min(100, Math.max(0, percent)))}&device_id=${device}`, { method: 'PUT' }).catch(() => undefined);

/* ---------- Klang eines klingelnden Weckers ---------- */

/**
 * Spielt den gewählten Klang, solange `playing` gilt. Klappt YouTube, Spotify oder das
 * eigene Lied nicht, kommt der Weckton – ein Wecker darf nie stumm bleiben.
 * `keepMusic`: Spotify läuft nach dem Ausschalten weiter.
 */
function AlarmSound({ alarm, playing, keepMusic, onFallback }: { alarm: Alarm; playing: boolean; keepMusic: boolean; onFallback: (why: string) => void }) {
  const { clientId, connected } = useSpotify();
  const [fallback, setFallback] = useState<string | null>(null);
  const [fileUrl, setFileUrl] = useState<string | null>(null);
  const box = useRef<HTMLDivElement>(null);
  const yt = useRef<YTPlayer | null>(null);
  const playingRef = useLatest(playing);
  const keepRef = useLatest(keepMusic);
  const mode = fallback ? 'ton' : alarm.sound;
  const fade = !!alarm.fadeIn;
  const start = alarm.clipStart ?? 0;

  const fail = useCallback((why: string) => setFallback((f) => f ?? why), []);
  useEffect(() => {
    if (fallback) onFallback(`${fallback} Stattdessen klingelt der Weckton.`);
  }, [fallback, onFallback]);

  // Eigenes Lied vom Gerät laden
  useEffect(() => {
    if (alarm.sound !== 'datei') return;
    let url = '';
    loadSoundFile(alarm.id)
      .then((blob) => (blob ? setFileUrl((url = URL.createObjectURL(blob))) : fail('Das Lied liegt nicht auf diesem Gerät.')))
      .catch(() => fail('Das Lied ließ sich nicht laden.'));
    return () => {
      if (url) URL.revokeObjectURL(url);
    };
  }, [alarm.id, alarm.sound, fail]);

  // Weckton und eigenes Lied
  useEffect(() => {
    if (mode !== 'ton' && mode !== 'datei') return;
    const src = mode === 'datei' ? fileUrl : tone(alarm.tone);
    if (!playing || !src) return stopLocal();
    clearTimeout(previewTimer);
    const t0 = Date.now();
    playLocal(src, fade ? fadeVolume(0) : 1)
      .then(() => {
        if (mode === 'datei' && element) element.currentTime = start;
      })
      .catch(() => {
        if (mode === 'datei') fail('Das Lied ließ sich nicht abspielen.');
        // Lied fehlt in der App: erzeugter Ton, damit es nie still bleibt
        else if (playingRef.current && src !== synth(alarm.tone)) playLocal(synth(alarm.tone), 1).catch(() => undefined);
      });
    // Eigenes Lied: nur den gewählten Ausschnitt wiederholen
    const el = audio();
    const clip = () => {
      if (mode === 'datei' && (el.currentTime >= start + CLIP_SECONDS || el.currentTime < start - 1)) el.currentTime = start;
    };
    el.addEventListener('timeupdate', clip);
    // Sanft lauter (das iPhone lässt die Lautstärke im Browser nicht ändern – dort bleibt es laut)
    const ramp = fade ? setInterval(() => element && (element.volume = fadeVolume(Date.now() - t0)), 500) : 0;
    return () => {
      el.removeEventListener('timeupdate', clip);
      clearInterval(ramp);
      stopLocal();
    };
  }, [mode, playing, fileUrl, fail, fade, alarm.tone, start]);

  // YouTube: Player anlegen; spielt er nach ein paar Sekunden nicht, kommt der Weckton
  useEffect(() => {
    if (mode !== 'youtube') return;
    const id = youtubeId(alarm.soundUrl);
    if (!id) return fail('Der YouTube-Link ist ungültig.');
    let cancelled = false;
    loadYouTube()
      .then((YT) => {
        if (cancelled || !box.current) return;
        const host = document.createElement('div');
        box.current.replaceChildren(host);
        yt.current = new YT.Player(host, {
          videoId: id,
          width: 320,
          height: 180,
          playerVars: { autoplay: 1, playsinline: 1, controls: 0, rel: 0 },
          events: {
            onReady: (e) => {
              if (fade) e.target.setVolume(10);
              if (playingRef.current) e.target.playVideo();
            },
            onStateChange: (e) => e.data === 0 && (e.target.seekTo(0), e.target.playVideo()),
            onError: () => fail('Das YouTube-Video lässt sich nicht einbetten.'),
          },
        });
      })
      .catch(() => fail('YouTube ist nicht erreichbar.'));
    const check = setTimeout(() => {
      if (playingRef.current && yt.current?.getPlayerState?.() !== 1) fail('YouTube durfte nicht automatisch abspielen.');
    }, 7000);
    return () => {
      cancelled = true;
      clearTimeout(check);
      yt.current?.destroy();
      yt.current = null;
    };
  }, [mode, alarm.soundUrl, fail, fade, playingRef]);

  useEffect(() => {
    if (mode !== 'youtube' || !yt.current?.playVideo) return;
    if (playing) yt.current.playVideo();
    else yt.current.pauseVideo();
  }, [mode, playing]);

  useEffect(() => {
    if (mode !== 'youtube' || !playing || !fade) return;
    const t0 = Date.now();
    const id = setInterval(() => yt.current?.setVolume?.(Math.round(fadeVolume(Date.now() - t0) * 100)), 1000);
    return () => clearInterval(id);
  }, [mode, playing, fade]);

  // Spotify: auf einem verbundenen Gerät abspielen (Premium nötig)
  const spotifyDevice = useRef<string | null>(null);
  const spotifyTarget = useRef(80);
  const gone = useRef(false);
  useEffect(() => {
    if (mode !== 'spotify') return;
    if (!connected || !clientId) return fail('Spotify ist nicht verbunden.');
    let ramp = 0;
    let stopped = false;
    const fadeUp = (device: string) => {
      if (!fade || stopped) return;
      const t0 = Date.now();
      void spotifyVolume(clientId, device, spotifyTarget.current * fadeVolume(0));
      ramp = window.setInterval(() => {
        const v = fadeVolume(Date.now() - t0);
        void spotifyVolume(clientId, device, spotifyTarget.current * v);
        if (v >= 1) clearInterval(ramp);
      }, 5000);
    };
    if (playing) {
      const resume = spotifyDevice.current
        ? api(clientId, `/me/player/play?device_id=${spotifyDevice.current}`, { method: 'PUT' }).then(() => spotifyDevice.current!)
        : startSpotify(clientId, alarm.soundUrl).then(({ id, volume }) => {
            spotifyDevice.current = id;
            // Bis zur bisherigen Lautstärke hochregeln, mindestens aber gut hörbar
            spotifyTarget.current = Math.max(60, volume ?? 80);
            return id;
          });
      resume
        .then((device) => {
          // Start kam erst nach dem Stopp an: anhalten, wenn das Lied nicht mehr laufen soll
          if (stopped && !playingRef.current && !(gone.current && keepRef.current)) {
            void api(clientId, `/me/player/pause?device_id=${device}`, { method: 'PUT' }).catch(() => undefined);
            return;
          }
          fadeUp(device);
        })
        .catch((e: Error) => fail(`Spotify: ${e.message}.`));
    } else if (spotifyDevice.current) {
      api(clientId, '/me/player/pause', { method: 'PUT' }).catch(() => undefined);
    }
    return () => {
      stopped = true;
      clearInterval(ramp);
    };
  }, [mode, playing, connected, clientId, alarm.soundUrl, fail, fade, playingRef, keepRef]);
  useEffect(
    () => () => {
      gone.current = true;
      const device = spotifyDevice.current;
      if (!device || !clientId) return;
      // Nach dem Ausschalten auf Wunsch weiterspielen
      if (keepRef.current) void spotifyVolume(clientId, device, spotifyTarget.current);
      else api(clientId, '/me/player/pause', { method: 'PUT' }).catch(() => undefined);
    },
    [clientId, keepRef],
  );

  // Vibrieren (nur Android)
  useEffect(() => {
    if (!playing || !('vibrate' in navigator)) return;
    const buzz = () => navigator.vibrate([700, 300, 700]);
    buzz();
    const id = setInterval(buzz, 2000);
    return () => {
      clearInterval(id);
      navigator.vibrate(0);
    };
  }, [playing]);

  return mode === 'youtube' ? <div ref={box} className="alarm-video" /> : null;
}

/* ---------- QR-Code-Scanner ---------- */

interface Detector { detect(source: CanvasImageSource): Promise<{ rawValue: string }[]> }
type DetectorCtor = { new (opts: { formats: string[] }): Detector; getSupportedFormats(): Promise<string[]> };

/** Liest QR-Codes über die Rückkamera: mit BarcodeDetector (Android), sonst mit jsQR (iPhone). */
async function makeDecoder(): Promise<(canvas: HTMLCanvasElement) => Promise<string | null>> {
  const BD = (window as unknown as { BarcodeDetector?: DetectorCtor }).BarcodeDetector;
  if (BD && (await BD.getSupportedFormats().catch((): string[] => [])).includes('qr_code')) {
    const d = new BD({ formats: ['qr_code'] });
    return async (canvas) => (await d.detect(canvas))[0]?.rawValue ?? null;
  }
  const { default: jsQR } = await import('jsqr');
  return async (canvas) => {
    const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
    const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
    return jsQR(img.data, img.width, img.height, { inversionAttempts: 'dontInvert' })?.data ?? null;
  };
}

export function QrScanner({ onResult }: { onResult: (text: string) => void }) {
  const video = useRef<HTMLVideoElement>(null);
  const [error, setError] = useState('');
  const onResultRef = useRef(onResult);
  onResultRef.current = onResult;

  useEffect(() => {
    let stream: MediaStream | null = null;
    let timer = 0;
    let stopped = false;
    (async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' } }, audio: false });
      } catch {
        setError('Kein Zugriff auf die Kamera – bitte in den Einstellungen erlauben.');
        return;
      }
      if (stopped || !video.current) return stream.getTracks().forEach((t) => t.stop());
      video.current.srcObject = stream;
      await video.current.play().catch(() => undefined);
      const decode = await makeDecoder();
      const canvas = document.createElement('canvas');
      let last = '';
      const scan = async () => {
        const v = video.current;
        if (stopped || !v) return;
        if (v.videoWidth) {
          const scale = Math.min(1, 640 / v.videoWidth);
          canvas.width = Math.round(v.videoWidth * scale);
          canvas.height = Math.round(v.videoHeight * scale);
          canvas.getContext('2d', { willReadFrequently: true })!.drawImage(v, 0, 0, canvas.width, canvas.height);
          const text = await decode(canvas).catch(() => null);
          if (text && text !== last) {
            last = text;
            onResultRef.current(text);
          }
          if (!text) last = '';
        }
        timer = window.setTimeout(scan, 250);
      };
      scan();
    })();
    return () => {
      stopped = true;
      clearTimeout(timer);
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  return (
    <div className="qr-scanner">
      {error ? <p className="alert">{error}</p> : <video ref={video} playsInline muted />}
    </div>
  );
}

/* ---------- Aufgaben zum Abschalten ---------- */

function MathChallenge({ alarm, active, onActivity, onSolved }: ChallengeProps) {
  const rounds = Math.max(1, alarm.rounds);
  const [done, setDone] = useState(0);
  const [problem, setProblem] = useState(() => mathProblem(alarm.level));
  const [input, setInput] = useState('');
  const [wrong, setWrong] = useState(false);
  const field = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (active) field.current?.focus();
  }, [active]);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    onActivity();
    if (!isCorrectNumber(problem, input)) {
      setWrong(true);
      setInput('');
      return;
    }
    setWrong(false);
    setInput('');
    if (done + 1 >= rounds) return onSolved();
    setDone(done + 1);
    setProblem(mathProblem(alarm.level));
  };
  return (
    <form className="alarm-task" onSubmit={submit}>
      <span className="muted small">Aufgabe {done + 1} von {rounds}</span>
      <strong className="alarm-question">{problem.question} = ?</strong>
      <input ref={field} inputMode="numeric" pattern="-?[0-9]*" autoComplete="off" value={input} onChange={(e) => { setInput(e.target.value); setWrong(false); onActivity(); }} aria-label="Ergebnis" />
      {wrong && <span className="alarm-wrong">Falsch – nochmal.</span>}
      <button className="primary" type="submit">Prüfen</button>
    </form>
  );
}

function TextChallenge({ alarm, active, onActivity, onSolved }: ChallengeProps) {
  const [phrase] = useState(() => alarm.phrase.trim() || randomPhrase());
  const [input, setInput] = useState('');
  const field = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    if (active) field.current?.focus();
  }, [active]);
  return (
    <div className="alarm-task">
      <span className="muted small">Tippe genau diesen Satz ab:</span>
      <strong className="alarm-phrase" aria-label={phrase}>{phrase}</strong>
      <textarea
        ref={field}
        rows={3}
        value={input}
        autoComplete="off"
        autoCorrect="off"
        spellCheck={false}
        onPaste={(e) => e.preventDefault()}
        onChange={(e) => {
          setInput(e.target.value);
          onActivity();
          if (isCorrectPhrase(phrase, e.target.value)) onSolved();
        }}
        aria-label="Satz abtippen"
      />
    </div>
  );
}

function QrChallenge({ alarm, active, onActivity, onSolved }: ChallengeProps) {
  const [scanning, setScanning] = useState(false);
  const [wrong, setWrong] = useState(false);
  useEffect(() => {
    if (!active) setScanning(false);
  }, [active]);
  return (
    <div className="alarm-task">
      <span className="muted small">Geh zum hinterlegten QR-Code und scanne ihn.</span>
      {scanning ? (
        <QrScanner
          onResult={(text) => {
            onActivity();
            if (text === alarm.qr) onSolved();
            else setWrong(true);
          }}
        />
      ) : (
        <button className="primary" type="button" onClick={() => { setScanning(true); onActivity(); }}>Kamera öffnen</button>
      )}
      {wrong && <span className="alarm-wrong">Das ist nicht der hinterlegte Code.</span>}
    </div>
  );
}

/** Aktuelle Rückruffunktionen für Effekte, ohne sie neu starten zu müssen */
function useLatest<T>(value: T) {
  const ref = useRef(value);
  ref.current = value;
  return ref;
}

type MotionPermission = { requestPermission?: () => Promise<'granted' | 'denied'> };

function ShakeChallenge(props: ChallengeProps) {
  const { alarm, active } = props;
  const target = shakeTarget(alarm.level);
  const [count, setCount] = useState(0);
  const [state, setState] = useState<'start' | 'laeuft' | 'geht-nicht'>('start');
  const counter = useRef(new ShakeCounter());
  const cb = useLatest(props);

  const begin = async () => {
    props.onActivity();
    const DM = (typeof DeviceMotionEvent === 'undefined' ? undefined : DeviceMotionEvent) as unknown as MotionPermission | undefined;
    if (!DM) return setState('geht-nicht');
    if (typeof DM.requestPermission === 'function') {
      const answer = await DM.requestPermission().catch(() => 'denied' as const);
      if (answer !== 'granted') return setState('geht-nicht');
    }
    setState('laeuft');
  };

  useEffect(() => {
    if (state !== 'laeuft' || !active) return;
    let got = false;
    const onMotion = (e: DeviceMotionEvent) => {
      const a = e.accelerationIncludingGravity;
      if (!a || a.x === null) return;
      got = true;
      const before = counter.current.count;
      const n = counter.current.feed(a.x ?? 0, a.y ?? 0, a.z ?? 0, e.timeStamp);
      if (n === before) return;
      setCount(n);
      cb.current.onActivity();
      if (n >= target) cb.current.onSolved();
    };
    window.addEventListener('devicemotion', onMotion);
    const check = setTimeout(() => !got && setState('geht-nicht'), 3000);
    return () => {
      window.removeEventListener('devicemotion', onMotion);
      clearTimeout(check);
    };
  }, [state, active, target, cb]);

  if (state === 'geht-nicht') {
    return (
      <>
        <p className="muted small">Dieses Gerät meldet keine Bewegung – darum heute Rechnen.</p>
        <MathChallenge {...props} />
      </>
    );
  }
  const pct = Math.min(1, count / target);
  return (
    <div className="alarm-task">
      <span className="muted small">Schüttle das Handy {target}-mal kräftig.</span>
      <div className="alarm-shake" style={{ ['--p' as string]: pct }} aria-live="polite">
        <strong>{Math.min(count, target)}</strong>
        <span>von {target}</span>
      </div>
      {state === 'start' && <button className="primary" type="button" onClick={() => void begin()}>Los geht’s</button>}
    </div>
  );
}

const MEMORY_COLORS = ['#FF3B30', '#34C759', '#007AFF', '#FFCC00'];
const MEMORY_NAMES = ['Rot', 'Grün', 'Blau', 'Gelb'];

function MemoryChallenge(props: ChallengeProps) {
  const { alarm, active } = props;
  const length = memoryLength(alarm.level);
  const [seq, setSeq] = useState(() => memorySequence(length));
  const [phase, setPhase] = useState<'zeigen' | 'tippen'>('zeigen');
  const [pos, setPos] = useState(0);
  const [lit, setLit] = useState<number | null>(null);
  const [wrong, setWrong] = useState(false);
  const cb = useLatest(props);

  useEffect(() => {
    if (!active || phase !== 'zeigen') return;
    const step = 750;
    const timers = seq.flatMap((n, i) => [window.setTimeout(() => setLit(n), 800 + i * step), window.setTimeout(() => setLit(null), 800 + i * step + 480)]);
    timers.push(window.setTimeout(() => { setPhase('tippen'); cb.current.onActivity(); }, 800 + seq.length * step));
    return () => timers.forEach(clearTimeout);
  }, [active, phase, seq, cb]);

  const tap = (n: number) => {
    if (phase !== 'tippen') return;
    props.onActivity();
    setLit(n);
    setTimeout(() => setLit((x) => (x === n ? null : x)), 180);
    if (seq[pos] !== n) {
      setWrong(true);
      setSeq(memorySequence(length));
      setPos(0);
      setPhase('zeigen');
      return;
    }
    setWrong(false);
    if (pos + 1 >= seq.length) props.onSolved();
    else setPos(pos + 1);
  };

  return (
    <div className="alarm-task">
      <span className="muted small">{phase === 'zeigen' ? `Merk dir die Folge (${length} Farben) …` : `Jetzt nachtippen: ${pos} von ${length}`}</span>
      <div className="alarm-memory">
        {MEMORY_COLORS.map((c, i) => (
          <button key={c} type="button" className={lit === i ? 'lit' : ''} style={{ ['--c' as string]: c }} disabled={phase !== 'tippen'} onClick={() => tap(i)} aria-label={MEMORY_NAMES[i]} />
        ))}
      </div>
      {wrong && <span className="alarm-wrong">Falsch – neue Folge.</span>}
    </div>
  );
}

interface ChallengeProps {
  alarm: Alarm;
  active: boolean;
  onActivity: () => void;
  onSolved: () => void;
}

function Challenge(props: ChallengeProps) {
  if (props.alarm.challenge === 'text') return <TextChallenge {...props} />;
  if (props.alarm.challenge === 'qr' && props.alarm.qr) return <QrChallenge {...props} />;
  if (props.alarm.challenge === 'schuetteln') return <ShakeChallenge {...props} />;
  if (props.alarm.challenge === 'memory') return <MemoryChallenge {...props} />;
  return <MathChallenge {...props} />;
}

/* ---------- Klingeln ---------- */

const RING_EVENT = 'antonos:wecker-test';
const FIRED_KEY = 'antonos:wecker-geklingelt';
/** Klingelnder Wecker – überlebt ein Neuladen, damit man ihn so nicht los wird */
const ACTIVE_KEY = 'antonos:wecker-aktiv';
const ACTIVE_MAX = 60 * 60_000;
/** Geplanter Wach-Check: { alarm, at } */
const WAKE_KEY = 'antonos:wecker-wach-check';
/** So lange hat man beim Wach-Check Zeit zu antworten */
const WAKE_ANSWER = 60_000;
/** Schon gemeldete Schlafenszeiten */
const BEDTIME_KEY = 'antonos:schlafenszeit-gemeldet';

/** Wecker probehalber klingeln lassen (aus einem Tippen heraus aufrufen) */
export function testAlarm(alarm: Alarm) {
  unlockAlarmAudio();
  window.dispatchEvent(new CustomEvent<Alarm>(RING_EVENT, { detail: alarm }));
}

/** Gerade getesteter Wecker in der iOS-App (ist evtl. noch nicht gespeichert) */
let nativeTest: { alarm: Alarm; at: number } | null = null;
const NATIVE_TEST_SECONDS = 10;
/** So lange nach dem Start gilt ein am iPhone gestoppter Wecker mit gleicher ID noch als Test */
const NATIVE_TEST_WINDOW = 15 * 60_000;

/** iOS-App: echten Wecker in wenigen Sekunden klingeln lassen. Gibt die Wartezeit zurück. */
export async function testNativeAlarm(alarm: Alarm): Promise<number> {
  nativeTest = { alarm, at: Date.now() };
  const s = snoozeOf(alarm);
  await AntonAlarm.ringIn({ seconds: NATIVE_TEST_SECONDS, id: alarm.id, title: `${alarmTitle(alarm)} · Test`, task: hasTask(alarm), snooze: s.on ? s.minutes * 60 : 0, snoozeMax: s.max, sound: alarmSoundFile(alarm) });
  return NATIVE_TEST_SECONDS;
}

/**
 * Zuletzt ans iPhone übergebene Wecker – nur im Speicher, damit nach jedem App-Start einmal
 * abgeglichen wird (iOS kann die Wecker verlieren, z. B. wenn die Erlaubnis entzogen wurde).
 */
let syncedList = '';
/** Abgleiche laufen nacheinander – gleichzeitige überschrieben sich am iPhone gegenseitig */
let syncQueue: Promise<void> = Promise.resolve();
/** Meldet nach jedem Stellen am iPhone, wie viele Wecker sich nicht stellen ließen */
export const SYNC_EVENT = 'antonos:wecker-ios-gestellt';
/** Ein eigener Ton liegt neu in der App – die Wecker müssen ihn neu einplanen */
const SOUND_EVENT = 'antonos:wecker-ton-gespeichert';

/**
 * iOS-App: stellt alle eingeschalteten Wecker als echte iPhone-Wecker (AlarmKit).
 * Gibt den Stand der Erlaubnis zurück – null, solange er noch nicht feststeht.
 */
export function useNativeAlarmSync(alarms: Alarm[]): AlarmPermission | null {
  const [state, setState] = useState<AlarmPermission | null>(() => (isNativeApp() ? null : 'unavailable'));
  // Neu gespeicherter eigener Ton oder App wieder im Vordergrund: Wecker erneut abgleichen, auch wenn die Liste
  // gleich bleibt (das iPhone stellt dabei nur neu, was fehlt oder sich geändert hat)
  const [rev, setRev] = useState(0);
  useEffect(() => {
    const again = () => {
      syncedList = '';
      setRev((n) => n + 1);
    };
    window.addEventListener(SOUND_EVENT, again);
    const onResume = isNativeApp() ? NativeApp.addListener('appStateChange', ({ isActive }) => isActive && again()) : null;
    return () => {
      window.removeEventListener(SOUND_EVENT, again);
      void onResume?.then((h) => h.remove());
    };
  }, []);
  // Alle 5 Minuten neu berechnen: Einzeltermine (Überspringen, Pause) rücken weiter
  const [tick, setTick] = useState(() => Math.floor(Date.now() / 300_000));
  useEffect(() => {
    if (!isNativeApp()) return;
    const id = setInterval(() => setTick(Math.floor(Date.now() / 300_000)), 60_000);
    return () => clearInterval(id);
  }, []);
  const list = JSON.stringify(nativeAlarms(alarms, new Date(tick * 300_000)));
  useEffect(() => {
    if (!isNativeApp()) return;
    let cancelled = false;
    // Hinten anstellen: Ein neuerer Stand überholt einen älteren, der noch nicht dran war
    syncQueue = syncQueue.then(async () => {
      if (cancelled) return;
      const wanted = JSON.parse(list).length > 0;
      const permission = await nativeAlarmPermission(wanted);
      if (cancelled) return;
      setState(permission);
      if (permission !== 'granted' || syncedList === list) return;
      const res = await AntonAlarm.sync({ alarms: JSON.parse(list) }).catch(() => null);
      const failed = res ? res.failed : JSON.parse(list).length;
      // Bei Fehlern nicht merken – beim nächsten Öffnen oder der nächsten Änderung wird es erneut versucht
      syncedList = failed === 0 ? list : '';
      window.dispatchEvent(new CustomEvent<number>(SYNC_EVENT, { detail: failed }));
    }).catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [list, rev]);
  return state;
}

function readJson<T>(key: string, fallback: T): T {
  try {
    return (JSON.parse(localStorage.getItem(key) ?? 'null') as T) ?? fallback;
  } catch {
    return fallback;
  }
}
function writeJson(key: string, value: unknown) {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Speicher voll o. Ä.
  }
}

interface Ringing {
  alarm: Alarm;
  /** klingelt = Ton läuft, aufgabe = still, Zeit läuft, schlummert = still bis `deadline` */
  phase: 'klingelt' | 'aufgabe' | 'schlummert';
  deadline: number;
  test: boolean;
  /** Neu zählen bei jedem neuen Klingeln, damit die Aufgabe neu startet */
  round: number;
  /** Kam vom echten iPhone-Wecker: Das iPhone klingelt wieder, falls AntonOS zugeht */
  native?: boolean;
  /** Wie oft schon geschlummert */
  snoozes: number;
  /** Wann der Wecker zuerst klingelte (ms) – für die Statistik */
  ringAt: number;
}

interface Saved {
  alarm: Alarm;
  since: number;
  snoozes?: number;
  ringAt?: number;
  snoozeUntil?: number;
}

/**
 * Prüft jede Sekunde, ob ein Wecker klingeln soll – nur am Handy – und zeigt dann
 * den Wecker über allem an. Testläufe klingeln auf jedem Gerät.
 */
export function AlarmRinger() {
  const { data, update, add } = useStore();
  const [ringing, setRinging] = useState<Ringing | null>(() => {
    const saved = readJson<Saved | null>(ACTIVE_KEY, null);
    if (!saved || Date.now() - saved.since >= ACTIVE_MAX) return null;
    const snoozing = !!saved.snoozeUntil && saved.snoozeUntil > Date.now();
    return { alarm: saved.alarm, phase: snoozing ? 'schlummert' : 'klingelt', deadline: snoozing ? saved.snoozeUntil! : 0, test: false, round: 0, snoozes: saved.snoozes ?? 0, ringAt: saved.ringAt ?? saved.since };
  });
  const [brief, setBrief] = useState<{ alarm: Alarm; snoozes: number; offAt: number } | null>(null);
  const [wake, setWake] = useState<{ alarm: Alarm; at: number } | null>(() => readJson<{ alarm: Alarm; at: number } | null>(WAKE_KEY, null));
  const [now, setNow] = useState(() => Date.now());
  const [fallbackNote, setFallbackNote] = useState('');
  const alarmsRef = useRef(data.alarms);
  alarmsRef.current = data.alarms;
  const ringingRef = useRef(ringing);
  ringingRef.current = ringing;
  const nativeState = useNativeAlarmSync(data.alarms);
  const routines = useRoutine();
  /** Startet die Routine, die an diesem Wecker hängt – true, wenn es eine gibt */
  const startRoutineAfter = useLatest((alarmId: string): boolean => {
    const routine = data.routines.find((r) => r.alarmId === alarmId && r.steps.length > 0);
    if (routine) routines.start(routine.id);
    return !!routine;
  });

  // iOS-App: Einmalige Wecker, die das iPhone schon geklingelt hat, ausschalten
  useEffect(() => {
    if (nativeState !== 'granted') return;
    const sweep = () => expiredOneShots(alarmsRef.current, new Date()).forEach((a) => update('alarms', a.id, { enabled: false }));
    sweep();
    // Auch bei offener App: Ein Wecker ohne Aufgabe meldet sein Klingeln nicht an AntonOS
    const timer = setInterval(sweep, 60_000);
    const onResume = NativeApp.addListener('appStateChange', ({ isActive }) => isActive && sweep());
    return () => {
      clearInterval(timer);
      void onResume.then((h) => h.remove());
    };
  }, [nativeState, update]);

  const start = useCallback((alarm: Alarm, test: boolean) => {
    setFallbackNote('');
    setBrief(null);
    setRinging({ alarm, phase: 'klingelt', deadline: 0, test, round: 0, snoozes: 0, ringAt: Date.now() });
    if (!test) writeJson(ACTIVE_KEY, { alarm, since: Date.now(), ringAt: Date.now() } satisfies Saved);
  }, []);

  // Klingeln im Browser – in der iOS-App mit echtem Wecker übernimmt das das iPhone
  useEffect(() => {
    if (!isMobile() || nativeState === null || nativeState === 'granted') return;
    const check = () => {
      if (ringingRef.current) return;
      const fired = readJson<string[]>(FIRED_KEY, []);
      const due = dueAlarms(alarmsRef.current, new Date(), fired);
      if (due.length === 0) return;
      writeJson(FIRED_KEY, [...fired, ...due.map((d) => d.key)].slice(-100));
      const { alarm } = due[0];
      for (const d of due) if (d.alarm.days.length === 0) update('alarms', d.alarm.id, { enabled: false });
      start(alarm, false);
      if (document.visibilityState === 'hidden') void notify(`⏰ ${alarm.label || 'Wecker'} ${alarm.time}`, 'Tippe hier, um den Wecker auszuschalten.', 'wecker');
    };
    check();
    const id = setInterval(check, 1000);
    document.addEventListener('visibilitychange', check);
    return () => {
      clearInterval(id);
      document.removeEventListener('visibilitychange', check);
    };
  }, [start, update, nativeState]);

  // iOS-App: Wecker wurde am iPhone gestoppt → hier die Aufgabe lösen
  useEffect(() => {
    if (!isNativeApp()) return;
    const take = async () => {
      const stopped = await AntonAlarm.takeStopped().catch(() => ({}) as { id?: string; at?: number; snoozes?: number });
      if (stopped.id === undefined) return;
      const saved = alarmsRef.current.find((a) => a.id === stopped.id);
      // Test geht vor: auch ein gespeicherter Wecker wird beim Testen nicht ausgeschaltet, und es gilt der Entwurf
      const probe = nativeTest && nativeTest.alarm.id === stopped.id && (stopped.at ?? Date.now()) - nativeTest.at < NATIVE_TEST_WINDOW ? nativeTest.alarm : null;
      if (probe) nativeTest = null;
      const test = !!probe;
      const alarm = probe ?? saved ?? { ...defaultAlarm(), id: stopped.id || 'wecker' };
      if (!test && saved && saved.days.length === 0 && saved.enabled) update('alarms', saved.id, { enabled: false });
      if (!hasTask(alarm)) {
        // Ohne Aufgabe: die Routine zum Wecker startet gleich – aber nur kurz nach dem Ausschalten
        if (!test && Date.now() - (stopped.at || Date.now()) < 30 * 60_000) startRoutineAfter.current(alarm.id);
        return void AntonAlarm.solved().catch(() => undefined);
      }
      const seconds = solveSeconds(alarm.challenge === 'qr' && !alarm.qr ? 'rechnen' : alarm.challenge);
      const deadline = Date.now() + seconds * 1000;
      setNow(Date.now());
      setFallbackNote('');
      const ringAt = previousRing(alarm, stopped.at || Date.now());
      setBrief(null);
      setRinging((r) =>
        r && r.alarm.id === alarm.id
          ? { ...r, phase: 'aufgabe', deadline, native: true, snoozes: Math.max(r.snoozes, stopped.snoozes ?? 0) }
          : { alarm, phase: 'aufgabe', deadline, test, round: 0, native: true, snoozes: stopped.snoozes ?? 0, ringAt },
      );
      if (!test) writeJson(ACTIVE_KEY, { alarm, since: Date.now(), ringAt, snoozes: stopped.snoozes ?? 0 } satisfies Saved);
    };
    void take();
    const onStop = AntonAlarm.addListener('stopped', () => void take());
    const onResume = NativeApp.addListener('appStateChange', ({ isActive }) => isActive && void take());
    return () => {
      void onStop.then((h) => h.remove());
      void onResume.then((h) => h.remove());
    };
  }, [update]);

  // iOS-App: Solange die Aufgabe offen ist, bleibt am iPhone ein Wecker gestellt – geht AntonOS zu, klingelt er wieder
  const ringingId = ringing?.alarm.id;
  const ringingPhase = ringing?.phase;
  const watchNative = !!ringing && isNativeApp() && nativeState === 'granted' && (!!ringing.native || !ringing.test);
  useEffect(() => {
    if (!watchNative) return;
    // Nur neu stellen, wenn sich der Zeitpunkt merklich verschiebt (während der Aufgabe bleibt er gleich)
    let planned = 0;
    const beat = () => {
      const r = ringingRef.current;
      if (!r) return;
      const seconds = nativeRingAgainSeconds(r.phase, (r.deadline - Date.now()) / 1000);
      const at = Date.now() + seconds * 1000;
      if (Math.abs(at - planned) < 2000) return;
      planned = at;
      // Beim Schlummern klingelt das iPhone wie der Wecker selbst (mit Schlummern, solange erlaubt)
      const snoozing = r.phase === 'schlummert';
      const s = snoozeOf(r.alarm);
      const opts = snoozing
        ? { task: hasTask(r.alarm), snooze: canSnooze(r.alarm, r.snoozes) ? s.minutes * 60 : 0, snoozeMax: s.max }
        : {};
      void AntonAlarm.ringIn({ seconds, id: r.alarm.id, title: alarmTitle(r.alarm), sound: alarmSoundFile(r.alarm), ...opts }).catch(() => (planned = 0));
    };
    beat();
    const id = setInterval(beat, 10_000);
    return () => clearInterval(id);
  }, [watchNative, ringingId, ringingPhase]);

  useEffect(() => {
    const onTest = (e: Event) => start((e as CustomEvent<Alarm>).detail, true);
    window.addEventListener(RING_EVENT, onTest);
    return () => window.removeEventListener(RING_EVENT, onTest);
  }, [start]);

  // Countdown (Aufgabe oder Schlummern), nach Ablauf klingelt er wieder
  useEffect(() => {
    if (ringing?.phase !== 'aufgabe' && ringing?.phase !== 'schlummert') return;
    const id = setInterval(() => {
      const t = Date.now();
      setNow(t);
      if (t >= (ringingRef.current?.deadline ?? Infinity)) setRinging((r) => r && { ...r, phase: 'klingelt', round: r.round + 1 });
    }, 250);
    return () => clearInterval(id);
  }, [ringing?.phase]);

  // Wach-Check: zur geplanten Zeit fragen, ohne Antwort klingelt der Wecker erneut
  const wakeAt = wake?.at;
  useEffect(() => {
    if (!wakeAt) return;
    let asked = false;
    const tickWake = () => {
      const t = Date.now();
      setNow(t);
      const w = readJson<{ alarm: Alarm; at: number } | null>(WAKE_KEY, null);
      if (!w) return setWake(null);
      if (t >= w.at && !asked) {
        asked = true;
        if (document.visibilityState === 'hidden') void notify('⏰ Bist du wach?', 'Tippe hier – sonst klingelt der Wecker gleich wieder.', 'wecker-wach');
      }
      if (t >= w.at + WAKE_ANSWER) {
        writeJson(WAKE_KEY, null);
        setWake(null);
        // In der iOS-App klingelt das iPhone selbst (siehe solved)
        if (!(isNativeApp() && nativeState === 'granted')) start({ ...w.alarm, wakeCheck: false, morning: false }, false);
      }
    };
    tickWake();
    const id = setInterval(tickWake, 1000);
    return () => clearInterval(id);
  }, [wakeAt, nativeState, start]);

  // Erinnerung zur Schlafenszeit (im Browser; die iOS-App plant sie beim System)
  const sleep = data.settings.sleep ?? defaultSleep();
  const sleepRef = useLatest(sleep);
  useEffect(() => {
    if (!sleep.remind || nativeState === null || nativeState === 'granted' || isNativeApp()) return;
    const check = () => {
      const now = Date.now();
      const due = bedtimeNotices(alarmsRef.current, sleepRef.current, new Date(now - 5 * 60_000)).filter((n) => n.at <= now);
      if (due.length === 0) return;
      const done = readJson<string[]>(BEDTIME_KEY, []);
      for (const n of due) {
        if (done.includes(n.tag)) continue;
        done.push(n.tag);
        void notify(n.title, n.body, n.tag);
      }
      writeJson(BEDTIME_KEY, done.slice(-30));
    };
    check();
    const id = setInterval(check, 30_000);
    return () => clearInterval(id);
  }, [sleep.remind, nativeState, sleepRef]);

  const overlays = (
    <>
      {brief && <MorningBrief alarm={brief.alarm} snoozes={brief.snoozes} offAt={brief.offAt} onClose={() => setBrief(null)} />}
      {wake && now >= wake.at && !ringing && (
        createPortal(
          <div className="alarm-ring wach" role="alertdialog" aria-modal="true" aria-label="Wach-Check">
            <div className="alarm-head">
              <span className="alarm-date">Wach-Check</span>
              <span className="alarm-big">Bist du wach?</span>
            </div>
            <div className="alarm-countdown" aria-live="polite">
              Sonst klingelt der Wecker in <strong>{Math.max(0, Math.ceil((wake.at + WAKE_ANSWER - now) / 1000))} s</strong> wieder
              <span className="alarm-bar"><span style={{ width: `${Math.max(0, (wake.at + WAKE_ANSWER - now) / WAKE_ANSWER) * 100}%` }} /></span>
            </div>
            <div className="alarm-buttons">
              <button
                type="button"
                className="alarm-snooze"
                onClick={() => {
                  writeJson(WAKE_KEY, null);
                  setWake(null);
                  if (isNativeApp()) void AntonAlarm.solved().catch(() => undefined);
                }}
              >
                Ich bin wach
              </button>
            </div>
          </div>,
          document.body,
        )
      )}
    </>
  );

  if (!ringing) return overlays;
  const { alarm, phase } = ringing;
  const window_ = solveSeconds(alarm.challenge === 'qr' && !alarm.qr ? 'rechnen' : alarm.challenge);
  const snoozeAllowed = canSnooze(alarm, ringing.snoozes);
  const silenceNow = () => {
    if (!hasTask(alarm)) return solved();
    unlockAlarmAudio();
    setNow(Date.now());
    setRinging({ ...ringing, phase: 'aufgabe', deadline: Date.now() + window_ * 1000 });
  };
  const snooze = () => {
    unlockAlarmAudio();
    const until = Date.now() + snoozeOf(alarm).minutes * 60_000;
    setNow(Date.now());
    const next = { ...ringing, phase: 'schlummert' as const, deadline: until, snoozes: ringing.snoozes + 1 };
    setRinging(next);
    if (!ringing.test) writeJson(ACTIVE_KEY, { alarm, since: Date.now(), ringAt: ringing.ringAt, snoozes: next.snoozes, snoozeUntil: until } satisfies Saved);
  };
  const activity = () => setRinging((r) => (r && r.phase === 'aufgabe' ? { ...r, deadline: Date.now() + window_ * 1000 } : r));
  const solved = () => {
    const offAt = Date.now();
    writeJson(ACTIVE_KEY, null);
    setRinging(null);
    if (!ringing.test) add('wakeLogs', { date: today(), alarmId: alarm.id, ringAt: ringing.ringAt, offAt, snoozes: ringing.snoozes });
    // Hängt eine Routine am Wecker, geht es gleich mit ihrem ersten Schritt los (statt des Morgen-Überblicks)
    const routineStarted = !ringing.test && startRoutineAfter.current(alarm.id);
    if (!routineStarted && alarm.morning !== false) setBrief({ alarm, snoozes: ringing.snoozes, offAt });
    const checkWake = !!alarm.wakeCheck && !ringing.test;
    const wakeMs = (alarm.wakeCheckMinutes ?? 5) * 60_000;
    if (checkWake) {
      const w = { alarm, at: offAt + wakeMs };
      writeJson(WAKE_KEY, w);
      setWake(w);
    }
    if (isNativeApp()) {
      // Zweimal, falls gerade noch ein Nachklingeln geplant wurde
      void AntonAlarm.solved().catch(() => undefined);
      setTimeout(() => {
        void AntonAlarm.solved()
          .catch(() => undefined)
          // Wach-Check: Das iPhone klingelt, falls bis dahin niemand „Ich bin wach“ tippt
          .then(() => (checkWake && nativeState === 'granted' ? AntonAlarm.ringIn({ seconds: Math.round((offAt + wakeMs + WAKE_ANSWER - Date.now()) / 1000), id: alarm.id, title: 'Bist du wach?', task: false }) : undefined))
          .catch(() => undefined);
      }, 1500);
    }
  };
  const left = Math.max(0, Math.ceil((ringing.deadline - now) / 1000));
  const clock = new Date(now);
  const showSong = alarm.sound !== 'ton' && !!(alarm.soundName || alarm.soundUrl);
  // Lied läuft beim Klingeln – und nach dem Stopp weiter, außer es ist abgeschaltet (am iPhone kommt es erst hier)
  const songOn = phase === 'klingelt' || (phase === 'aufgabe' && alarm.sound !== 'ton' && alarm.keepMusic !== false);

  return (
    <>
      {overlays}
      {createPortal(
        <div className={`alarm-ring ${phase}`} role="alertdialog" aria-modal="true" aria-label={`Wecker ${alarm.time}`}>
          <AlarmSound key={alarm.id + String(ringing.test)} alarm={alarm} playing={songOn} keepMusic={alarm.keepMusic !== false} onFallback={setFallbackNote} />
          <div className="alarm-head">
            <span className="alarm-date">{clock.toLocaleDateString('de-DE', { weekday: 'long', day: 'numeric', month: 'long' })}</span>
            <span className="alarm-big">{phase === 'klingelt' ? hhmm(clock) : alarm.time}</span>
            <span className="alarm-label">{alarm.label || 'Wecker'}{ringing.test ? ' · Test' : ''}</span>
          </div>
          {showSong && songOn && (
            <div className="alarm-song">
              <span className="alarm-song-cover" aria-hidden>♫</span>
              <span className="grow">
                <strong>{alarm.soundName || (alarm.sound === 'youtube' ? 'YouTube-Video' : 'Eigenes Lied')}</strong>
                <span>{alarm.sound === 'spotify' ? 'Spotify' : alarm.sound === 'youtube' ? 'YouTube' : 'Eigenes Lied'}</span>
              </span>
            </div>
          )}
          {fallbackNote && <p className="muted small alarm-note">{fallbackNote}</p>}
          {phase === 'klingelt' ? (
            <div className="alarm-buttons">
              {snoozeAllowed && <button type="button" className="alarm-snooze" onClick={snooze}>Schlummern · {snoozeOf(alarm).minutes} Min.</button>}
              <button type="button" className={snoozeAllowed ? 'alarm-stop' : 'alarm-snooze'} onClick={silenceNow}>{hasTask(alarm) ? 'Stopp und Aufgabe lösen' : 'Stopp'}</button>
              {snoozeOf(alarm).on && (
                <span className="alarm-hint">{snoozeAllowed ? `Noch ${snoozeOf(alarm).max - ringing.snoozes}-mal schlummern möglich` : 'Genug geschlummert – jetzt aufstehen'}</span>
              )}
            </div>
          ) : phase === 'schlummert' ? (
            <div className="alarm-buttons">
              <div className="alarm-countdown" aria-live="polite">
                Schlummert – klingelt wieder um <strong>{hhmm(new Date(ringing.deadline))}</strong>
                <span className="alarm-bar"><span style={{ width: `${(left / (snoozeOf(alarm).minutes * 60)) * 100}%` }} /></span>
              </div>
              <button type="button" className="alarm-stop" onClick={silenceNow}>{hasTask(alarm) ? 'Jetzt aufstehen und Aufgabe lösen' : 'Jetzt ausschalten'}</button>
            </div>
          ) : (
            <div className="alarm-countdown" aria-live="polite">
              Klingelt wieder in <strong>{left} s</strong>
              <span className="alarm-bar"><span style={{ width: `${(left / window_) * 100}%` }} /></span>
            </div>
          )}
          <div className="alarm-challenge" hidden={phase !== 'aufgabe'}>
            <Challenge key={ringing.round} alarm={alarm} active={phase === 'aufgabe'} onActivity={activity} onSolved={solved} />
          </div>
          {ringing.test && <button type="button" className="alarm-skip" onClick={solved}>Test beenden</button>}
        </div>,
        document.body,
      )}
    </>
  );
}
