import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { createPortal } from 'react-dom';
import { useStore } from '../store';
import type { Alarm } from '../types';
import { alarmTone, dueAlarms, isCorrectNumber, isCorrectPhrase, mathProblem, randomPhrase, silence, solveSeconds, spotifyUri, youtubeId } from '../lib/alarm';
import { api } from '../lib/spotify';
import { isMobile, notify } from '../lib/notify';
import { useSpotify } from './spotify';

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

let toneSrc: string | null = null;
const tone = () => (toneSrc ??= URL.createObjectURL(new Blob([alarmTone()], { type: 'audio/wav' })));

/** Muss aus einem Tippen heraus aufgerufen werden: schaltet die Wiedergabe für später frei. */
export function unlockAlarmAudio() {
  const el = audio();
  if (!el.paused) return;
  el.src = URL.createObjectURL(new Blob([silence()], { type: 'audio/wav' }));
  el.loop = false;
  el.play().then(() => el.pause()).catch(() => undefined);
}

function playLocal(src: string) {
  const el = audio();
  if (el.src !== src) el.src = src;
  el.loop = true;
  el.currentTime = 0;
  el.volume = 1;
  return el.play();
}

const stopLocal = () => element?.pause();

/* ---------- YouTube (IFrame-API) ---------- */

interface YTPlayer {
  playVideo(): void;
  pauseVideo(): void;
  seekTo(s: number): void;
  getPlayerState(): number;
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

interface Device { id: string | null; type: string; is_active: boolean }

/** Spielt auf dem aktiven Spotify-Gerät, sonst bevorzugt auf einem Handy */
async function startSpotify(clientId: string, link: string) {
  const target = spotifyUri(link);
  if (!target) throw new Error('Ungültiger Spotify-Link');
  const res = await api<{ devices: Device[] }>(clientId, '/me/player/devices');
  const devices = (res?.devices ?? []).filter((d) => d.id);
  const device = devices.find((d) => d.is_active) ?? devices.find((d) => d.type === 'Smartphone') ?? devices[0];
  if (!device) throw new Error('Kein Spotify-Gerät gefunden');
  const body = target.kind === 'track' ? { uris: [target.uri] } : { context_uri: target.uri };
  await api(clientId, `/me/player/play?device_id=${device.id}`, { method: 'PUT', body: JSON.stringify(body) });
  return device.id!;
}

/* ---------- Klang eines klingelnden Weckers ---------- */

/**
 * Spielt den gewählten Klang, solange `playing` gilt. Klappt YouTube, Spotify oder die
 * eigene Datei nicht, kommt der Standard-Ton – ein Wecker darf nie stumm bleiben.
 */
function AlarmSound({ alarm, playing, onFallback }: { alarm: Alarm; playing: boolean; onFallback: (why: string) => void }) {
  const { clientId, connected } = useSpotify();
  const [fallback, setFallback] = useState<string | null>(null);
  const [fileUrl, setFileUrl] = useState<string | null>(null);
  const box = useRef<HTMLDivElement>(null);
  const yt = useRef<YTPlayer | null>(null);
  const playingRef = useRef(playing);
  playingRef.current = playing;
  const mode = fallback ? 'ton' : alarm.sound;

  const fail = useCallback((why: string) => setFallback((f) => f ?? why), []);
  useEffect(() => {
    if (fallback) onFallback(fallback);
  }, [fallback, onFallback]);

  // Eigene Datei vom Gerät laden
  useEffect(() => {
    if (alarm.sound !== 'datei') return;
    let url = '';
    loadSoundFile(alarm.id)
      .then((blob) => (blob ? setFileUrl((url = URL.createObjectURL(blob))) : fail('Die Audiodatei liegt nicht auf diesem Gerät.')))
      .catch(() => fail('Die Audiodatei ließ sich nicht laden.'));
    return () => {
      if (url) URL.revokeObjectURL(url);
    };
  }, [alarm.id, alarm.sound, fail]);

  // Standard-Ton und eigene Datei
  useEffect(() => {
    if (mode !== 'ton' && mode !== 'datei') return;
    const src = mode === 'datei' ? fileUrl : tone();
    if (!playing || !src) return stopLocal();
    playLocal(src).catch(() => {
      if (mode === 'datei') fail('Die Audiodatei ließ sich nicht abspielen.');
    });
    return stopLocal;
  }, [mode, playing, fileUrl, fail]);

  // YouTube: Player anlegen; spielt er nach ein paar Sekunden nicht, Standard-Ton
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
            onReady: (e) => playingRef.current && e.target.playVideo(),
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
  }, [mode, alarm.soundUrl, fail]);

  useEffect(() => {
    if (mode !== 'youtube' || !yt.current?.playVideo) return;
    if (playing) yt.current.playVideo();
    else yt.current.pauseVideo();
  }, [mode, playing]);

  // Spotify: auf einem verbundenen Gerät abspielen (Premium nötig)
  const spotifyDevice = useRef<string | null>(null);
  useEffect(() => {
    if (mode !== 'spotify') return;
    if (!connected || !clientId) return fail('Spotify ist nicht verbunden.');
    if (playing) {
      const resume = spotifyDevice.current
        ? api(clientId, `/me/player/play?device_id=${spotifyDevice.current}`, { method: 'PUT' })
        : startSpotify(clientId, alarm.soundUrl).then((id) => (spotifyDevice.current = id));
      resume.catch((e: Error) => fail(`Spotify: ${e.message}`));
    } else if (spotifyDevice.current) {
      api(clientId, '/me/player/pause', { method: 'PUT' }).catch(() => undefined);
    }
  }, [mode, playing, connected, clientId, alarm.soundUrl, fail]);
  useEffect(
    () => () => {
      if (spotifyDevice.current && clientId) api(clientId, '/me/player/pause', { method: 'PUT' }).catch(() => undefined);
    },
    [clientId],
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

interface ChallengeProps {
  alarm: Alarm;
  active: boolean;
  onActivity: () => void;
  onSolved: () => void;
}

function Challenge(props: ChallengeProps) {
  if (props.alarm.challenge === 'text') return <TextChallenge {...props} />;
  if (props.alarm.challenge === 'qr' && props.alarm.qr) return <QrChallenge {...props} />;
  return <MathChallenge {...props} />;
}

/* ---------- Klingeln ---------- */

const RING_EVENT = 'antonos:wecker-test';
const FIRED_KEY = 'antonos:wecker-geklingelt';
/** Klingelnder Wecker – überlebt ein Neuladen, damit man ihn so nicht los wird */
const ACTIVE_KEY = 'antonos:wecker-aktiv';
const ACTIVE_MAX = 60 * 60_000;

/** Wecker probehalber klingeln lassen (aus einem Tippen heraus aufrufen) */
export function testAlarm(alarm: Alarm) {
  unlockAlarmAudio();
  window.dispatchEvent(new CustomEvent<Alarm>(RING_EVENT, { detail: alarm }));
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
  /** klingelt = Ton läuft, aufgabe = still, Zeit läuft */
  phase: 'klingelt' | 'aufgabe';
  deadline: number;
  test: boolean;
  /** Neu zählen bei jedem neuen Klingeln, damit die Aufgabe neu startet */
  round: number;
}

/**
 * Prüft jede Sekunde, ob ein Wecker klingeln soll – nur am Handy – und zeigt dann
 * den Wecker über allem an. Testläufe klingeln auf jedem Gerät.
 */
export function AlarmRinger() {
  const { data, update } = useStore();
  const [ringing, setRinging] = useState<Ringing | null>(() => {
    const saved = readJson<{ alarm: Alarm; since: number } | null>(ACTIVE_KEY, null);
    return saved && Date.now() - saved.since < ACTIVE_MAX ? { alarm: saved.alarm, phase: 'klingelt', deadline: 0, test: false, round: 0 } : null;
  });
  const [now, setNow] = useState(() => Date.now());
  const [fallbackNote, setFallbackNote] = useState('');
  const alarmsRef = useRef(data.alarms);
  alarmsRef.current = data.alarms;
  const ringingRef = useRef(ringing);
  ringingRef.current = ringing;

  const start = useCallback((alarm: Alarm, test: boolean) => {
    setFallbackNote('');
    setRinging({ alarm, phase: 'klingelt', deadline: 0, test, round: 0 });
    if (!test) writeJson(ACTIVE_KEY, { alarm, since: Date.now() });
  }, []);

  useEffect(() => {
    if (!isMobile()) return;
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
  }, [start, update]);

  useEffect(() => {
    const onTest = (e: Event) => start((e as CustomEvent<Alarm>).detail, true);
    window.addEventListener(RING_EVENT, onTest);
    return () => window.removeEventListener(RING_EVENT, onTest);
  }, [start]);

  // Countdown, nach Ablauf klingelt er wieder
  useEffect(() => {
    if (ringing?.phase !== 'aufgabe') return;
    const id = setInterval(() => {
      const t = Date.now();
      setNow(t);
      if (t >= (ringingRef.current?.deadline ?? Infinity)) setRinging((r) => r && { ...r, phase: 'klingelt', round: r.round + 1 });
    }, 250);
    return () => clearInterval(id);
  }, [ringing?.phase]);

  const onFallback = useCallback((why: string) => setFallbackNote(`${why} Darum klingelt der Standard-Ton.`), []);

  if (!ringing) return null;
  const { alarm, phase } = ringing;
  const window_ = solveSeconds(alarm.challenge === 'qr' && !alarm.qr ? 'rechnen' : alarm.challenge);
  const silenceNow = () => {
    unlockAlarmAudio();
    setNow(Date.now());
    setRinging({ ...ringing, phase: 'aufgabe', deadline: Date.now() + window_ * 1000 });
  };
  const activity = () => setRinging((r) => (r && r.phase === 'aufgabe' ? { ...r, deadline: Date.now() + window_ * 1000 } : r));
  const solved = () => {
    writeJson(ACTIVE_KEY, null);
    setRinging(null);
  };
  const left = Math.max(0, Math.ceil((ringing.deadline - now) / 1000));

  return createPortal(
    <div className={`alarm-ring ${phase}`} role="alertdialog" aria-modal="true" aria-label={`Wecker ${alarm.time}`}>
      <AlarmSound key={alarm.id + String(ringing.test)} alarm={alarm} playing={phase === 'klingelt'} onFallback={onFallback} />
      <div className="alarm-head">
        <span className="alarm-big">{alarm.time}</span>
        <span>{alarm.label || 'Wecker'}{ringing.test ? ' · Test' : ''}</span>
      </div>
      {fallbackNote && <p className="muted small alarm-note">{fallbackNote}</p>}
      {phase === 'klingelt' ? (
        <button type="button" className="alarm-off" onClick={silenceNow}>Ausschalten</button>
      ) : (
        <div className="alarm-countdown" aria-live="polite">
          Klingelt wieder in <strong>{left} s</strong>
          <span className="alarm-bar"><span style={{ width: `${(left / window_) * 100}%` }} /></span>
        </div>
      )}
      <div className="alarm-challenge" hidden={phase === 'klingelt'}>
        <Challenge key={ringing.round} alarm={alarm} active={phase === 'aufgabe'} onActivity={activity} onSolved={solved} />
      </div>
      {ringing.test && <button type="button" className="alarm-skip" onClick={solved}>Test beenden</button>}
    </div>,
    document.body,
  );
}
