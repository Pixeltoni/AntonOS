import { useEffect, useRef, useState, type ReactNode, type TouchEvent } from 'react';
import { useStore } from '../store';
import type { Alarm, AlarmChallenge, AlarmSound, ID } from '../types';
import {
  bedtimeFor, CHALLENGES, cycleTimes, defaultAlarm, defaultSleep, durationLabel, hhmm, isPaused, isPunctual, isSkipping, memoryLength, nextAlarm, nextRing,
  quickAlarm, repeatLabel, shakeTarget, skipNext, SLEEP_GOALS, SNOOZE_MINUTES, snoozeOf, spotifyUri, untilLabel, WAKE_CHECK_MINUTES, wakeStats, youtubeId,
} from '../lib/alarm';
import { addDays, parseDate, today } from '../lib/dates';
import { SONGS, TONES, toneLabel, toneOf } from '../lib/tones';
import { clampClipStart, CLIP_SECONDS, maxClipStart, mmss } from '../lib/clip';
import { isMobile } from '../lib/notify';
import { audioDuration, deleteSoundFile, loadSoundFile, previewClip, previewTone, QrScanner, removeNativeClip, saveNativeClip, saveSoundFile, SYNC_EVENT, testAlarm, testNativeAlarm, unlockAlarmAudio } from '../components/alarm';
import { isNativeApp, nativeAlarmPermission, type AlarmPermission } from '../lib/native';
import { useSpotify } from '../components/spotify';
import { api } from '../lib/spotify';
import { safeImageSrc } from '../lib/life';
import { Empty, PageHeader, Panel } from '../components/ui';
import { AddButton, Sheet } from '../components/sheet';

const soundLabel = (a: Pick<Alarm, 'tone' | 'sound' | 'soundName'>) => {
  if (a.sound === 'datei') return a.soundName || 'Eigenes Lied';
  if (a.sound === 'spotify') return a.soundName ? `Spotify: ${a.soundName}` : 'Spotify';
  if (a.sound === 'youtube') return 'YouTube';
  return toneLabel(a.tone);
};

const SOUND_CHOICES: { id: AlarmSound; label: string; hint: string }[] = [
  { id: 'ton', label: 'Weckton', hint: 'Einer der Töne unten – am zuverlässigsten' },
  { id: 'datei', label: 'Eigenes Lied', hint: 'Audiodatei, z. B. MP3 – ein 29-Sekunden-Ausschnitt' },
  { id: 'spotify', label: 'Spotify', hint: 'Song, Album oder Playlist (Premium)' },
  { id: 'youtube', label: 'YouTube', hint: 'Link zu einem Video' },
];

interface SpotifyItem { uri: string; name: string; detail: string; image: string | null }
interface Img { url: string }
interface ApiPlaylist { uri: string; name: string; images: Img[] | null; owner?: { display_name?: string } }
interface ApiTrack { uri: string; name: string; artists: { name: string }[]; album: { images: Img[] } }
interface ApiAlbum { uri: string; name: string; artists: { name: string }[]; images: Img[] }

const fromPlaylist = (p: ApiPlaylist): SpotifyItem => ({ uri: p.uri, name: p.name, detail: 'Playlist', image: p.images?.[0]?.url ?? null });
const fromTrack = (t: ApiTrack): SpotifyItem => ({ uri: t.uri, name: t.name, detail: `Song · ${t.artists.map((x) => x.name).join(', ')}`, image: t.album.images.at(-1)?.url ?? null });
const fromAlbum = (a: ApiAlbum): SpotifyItem => ({ uri: a.uri, name: a.name, detail: `Album · ${a.artists.map((x) => x.name).join(', ')}`, image: a.images.at(-1)?.url ?? null });

/** Song, Album oder Playlist aus dem verbundenen Spotify-Konto wählen – deine Playlists oder per Suche */
function SpotifyPicker({ value, name, onPick }: { value: string; name?: string; onPick: (uri: string, name: string) => void }) {
  const { clientId, connected } = useSpotify();
  const [query, setQuery] = useState('');
  const [items, setItems] = useState<SpotifyItem[] | null>(null);
  const [error, setError] = useState('');
  const seq = useRef(0);

  useEffect(() => {
    if (!connected || !clientId) return;
    const q = query.trim();
    const my = ++seq.current;
    const timer = setTimeout(
      () => {
        setError('');
        const load = q
          ? api<{ tracks?: { items: (ApiTrack | null)[] }; playlists?: { items: (ApiPlaylist | null)[] }; albums?: { items: (ApiAlbum | null)[] } }>(
              clientId,
              `/search?type=track,playlist,album&limit=8&q=${encodeURIComponent(q)}`,
            ).then((r) => [
              ...(r?.tracks?.items ?? []).filter((x): x is ApiTrack => !!x).map(fromTrack),
              ...(r?.playlists?.items ?? []).filter((x): x is ApiPlaylist => !!x).map(fromPlaylist),
              ...(r?.albums?.items ?? []).filter((x): x is ApiAlbum => !!x).map(fromAlbum),
            ])
          : api<{ items: (ApiPlaylist | null)[] }>(clientId, '/me/playlists?limit=50').then((r) => (r?.items ?? []).filter((x): x is ApiPlaylist => !!x).map(fromPlaylist));
        load
          .then((list) => my === seq.current && setItems(list))
          .catch(() => my === seq.current && (setItems([]), setError('Spotify ist gerade nicht erreichbar.')));
      },
      q ? 350 : 0,
    );
    return () => clearTimeout(timer);
  }, [query, connected, clientId]);

  if (!connected) {
    return <p className="muted small">Verbinde zuerst unter <a href="#/musik">Musik</a> dein Spotify-Konto – dann wählst du hier einen Song oder eine Playlist.</p>;
  }
  return (
    <div className="stack-tight">
      {value && <span className="small">✓ Gewählt: <strong>{name || 'Spotify-Titel'}</strong></span>}
      <input type="search" value={query} placeholder="Song, Album oder Playlist suchen" onChange={(e) => setQuery(e.target.value)} aria-label="Spotify durchsuchen" />
      <span className="muted small">{query.trim() ? 'Suchergebnisse' : 'Deine Playlists'}</span>
      {error && <p className="alert">{error}</p>}
      {items === null ? (
        <div className="skeleton" role="status" aria-label="Lädt"><i /><i /></div>
      ) : items.length === 0 ? (
        <p className="muted small">Nichts gefunden.</p>
      ) : (
        <ul className="alarm-spotify">
          {items.map((it) => {
            const img = safeImageSrc(it.image ?? undefined);
            return (
              <li key={it.uri}>
                <button type="button" className={it.uri === value ? 'selected' : ''} aria-pressed={it.uri === value} onClick={() => onPick(it.uri, it.name)}>
                  {img ? <img src={img} alt="" loading="lazy" /> : <span className="alarm-spotify-cover">🎵</span>}
                  <span className="grow">
                    <span className="alarm-spotify-name">{it.name}</span>
                    <span className="muted small">{it.detail}</span>
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

type Draft = Omit<Alarm, 'id'>;

const WEEKDAY_NAMES = ['Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag', 'Sonntag'];
const ROW = 36;
const HOURS = Array.from({ length: 24 }, (_, i) => i);
const MINUTES = Array.from({ length: 60 }, (_, i) => i);
const two = (n: number) => String(n).padStart(2, '0');

/** Eine Spalte des Drehrads: wischen oder tippen, rastet auf ganze Werte ein */
function WheelColumn({ values, value, onChange, label }: { values: number[]; value: number; onChange: (v: number) => void; label: string }) {
  const box = useRef<HTMLDivElement>(null);
  const settle = useRef(0);
  const index = Math.max(0, values.indexOf(value));
  useEffect(() => {
    const el = box.current;
    if (el && Math.round(el.scrollTop / ROW) !== index) el.scrollTo({ top: index * ROW });
  }, [index]);
  const onScroll = () => {
    clearTimeout(settle.current);
    settle.current = window.setTimeout(() => {
      const el = box.current;
      if (!el) return;
      const i = Math.min(values.length - 1, Math.max(0, Math.round(el.scrollTop / ROW)));
      if (values[i] !== value) onChange(values[i]);
    }, 90);
  };
  return (
    <div
      ref={box}
      className="wheel-col"
      role="listbox"
      aria-label={label}
      tabIndex={0}
      onScroll={onScroll}
      onKeyDown={(e) => {
        if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return;
        e.preventDefault();
        const i = (index + (e.key === 'ArrowUp' ? -1 : 1) + values.length) % values.length;
        onChange(values[i]);
      }}
    >
      {values.map((v) => (
        <button key={v} type="button" role="option" aria-selected={v === value} className={v === value ? 'on' : ''} tabIndex={-1} onClick={() => onChange(v)}>
          {two(v)}
        </button>
      ))}
    </div>
  );
}

/** Uhrzeit zum Drehen wie im iPhone-Wecker */
function WheelTime({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [h, m] = value.split(':').map(Number);
  return (
    <div className="wheel">
      <WheelColumn values={HOURS} value={h || 0} onChange={(v) => onChange(`${two(v)}:${two(m || 0)}`)} label="Stunde" />
      <span className="wheel-colon" aria-hidden>:</span>
      <WheelColumn values={MINUTES} value={m || 0} onChange={(v) => onChange(`${two(h || 0)}:${two(v)}`)} label="Minute" />
    </div>
  );
}

function NavRow({ label, value, onClick }: { label: string; value: string; onClick: () => void }) {
  return (
    <li>
      <button type="button" className="ios-row" onClick={onClick}>
        <span>{label}</span>
        <span className="ios-row-value">{value}</span>
        <span className="ios-chevron" aria-hidden>›</span>
      </button>
    </li>
  );
}

function SwitchRow({ label, hint, checked, onChange, children }: { label: string; hint?: string; checked: boolean; onChange: (v: boolean) => void; children?: ReactNode }) {
  return (
    <li>
      <label className="ios-row">
        <span className="grow">
          {label}
          {hint && <span className="ios-row-hint">{hint}</span>}
        </span>
        <input type="checkbox" className="switch" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      </label>
      {checked && children}
    </li>
  );
}

function CheckRow({ label, hint, on, onClick }: { label: string; hint?: string; on: boolean; onClick: () => void }) {
  return (
    <li>
      <button type="button" className="ios-row" aria-pressed={on} onClick={onClick}>
        <span className="grow">
          {label}
          {hint && <span className="ios-row-hint">{hint}</span>}
        </span>
        <span className="ios-check" aria-hidden>{on ? '✓' : ''}</span>
      </button>
    </li>
  );
}

type SubPage = 'wiederholen' | 'ton' | 'aufgabe';

const challengeLabel = (a: Draft) => {
  const c = CHALLENGES.find((x) => x.id === a.challenge)?.label ?? 'Rechnen';
  if (a.challenge === 'rechnen') return `${c}, ${a.rounds}×`;
  if (a.challenge === 'schuetteln') return `${c}, ${shakeTarget(a.level)}×`;
  if (a.challenge === 'memory') return `${c}, ${memoryLength(a.level)} Farben`;
  return c;
};

function AlarmSheet({ initial, id, native, onClose }: { initial: Draft; id?: ID; native: boolean; onClose: () => void }) {
  const { add, update, remove } = useStore();
  const [a, setA] = useState<Draft>(initial);
  const [page, setPage] = useState<SubPage | null>(null);
  const [scanning, setScanning] = useState(false);
  const [error, setError] = useState('');
  const [hint, setHint] = useState('');
  // Eigenes Lied: neu gewählte Datei und Länge (für den Ausschnitt)
  const [file, setFile] = useState<File | null>(null);
  const [duration, setDuration] = useState(0);
  const set = (patch: Partial<Draft>) => setA((x) => ({ ...x, ...patch }));
  const toggleDay = (d: number) => set({ days: a.days.includes(d) ? a.days.filter((x) => x !== d) : [...a.days, d].sort() });
  const snooze = snoozeOf(a);
  const now = new Date();

  const problem = (): string => {
    if (!/^\d\d:\d\d$/.test(a.time)) return 'Bitte eine Uhrzeit wählen.';
    if (a.sound === 'spotify' && !spotifyUri(a.soundUrl)) return 'Bitte einen Song, ein Album oder eine Playlist aus Spotify wählen.';
    if (a.sound === 'datei' && !file && !(initial.sound === 'datei' && initial.soundName)) return 'Bitte ein Lied (Audiodatei) auswählen.';
    if (a.sound === 'youtube' && !youtubeId(a.soundUrl)) return 'Bitte einen gültigen YouTube-Link einfügen.';
    if (a.challenge === 'qr' && !a.qr) return 'Bitte zuerst einen QR-Code scannen.';
    if (a.days.length === 0 && a.date && parseDate(a.date).getTime() + (Number(a.time.slice(0, 2)) * 60 + Number(a.time.slice(3))) * 60_000 <= Date.now()) {
      return a.date < today() ? 'Das Datum liegt in der Vergangenheit.' : 'Diese Uhrzeit ist heute schon vorbei – wähle eine spätere Zeit oder einen anderen Tag.';
    }
    return '';
  };

  const save = async () => {
    const p = problem();
    if (p) {
      setPage(null);
      return setError(p);
    }
    unlockAlarmAudio();
    const changed = a.time !== initial.time || a.days.join() !== initial.days.join();
    const final: Draft = {
      ...a,
      label: a.label.trim(),
      phrase: a.phrase.trim(),
      enabled: true,
      armedAt: Date.now(),
      tone: toneOf(a.tone),
      soundUrl: a.sound === 'spotify' || a.sound === 'youtube' ? a.soundUrl.trim() : '',
      soundName: a.sound === 'ton' ? undefined : a.soundName,
      clipStart: a.sound === 'datei' ? Math.max(0, Math.round(a.clipStart ?? 0)) : undefined,
      date: a.days.length === 0 ? a.date || undefined : undefined,
      // Neue Uhrzeit oder Tage: „Nur den nächsten auslassen“ gilt nicht mehr
      skip: changed ? undefined : a.skip,
    };
    const alarmId = id ?? add('alarms', final);
    if (id) update('alarms', id, final);
    if (final.sound === 'datei') {
      const problems: string[] = [];
      if (file) await saveSoundFile(alarmId, file).catch(() => problems.push('Das Lied ließ sich auf diesem Gerät nicht speichern.'));
      // iOS-App: Ausschnitt als echten Weckton ablegen (neu bei neuem Lied oder anderem Start)
      if (native && (file || final.clipStart !== initial.clipStart || initial.sound !== 'datei')) {
        const blob = file ?? (await loadSoundFile(alarmId).catch(() => undefined));
        if (blob) await saveNativeClip(alarmId, blob, final.clipStart ?? 0).catch(() => problems.push('Der Ausschnitt fürs gesperrte iPhone ließ sich nicht erstellen – dort klingelt der Weckton.'));
      }
      if (problems.length) alert(problems.join('\n'));
    } else if (id && initial.sound === 'datei') {
      void deleteSoundFile(id);
      void removeNativeClip(id);
    }
    onClose();
  };

  // Eigenes Lied: Länge der gespeicherten Datei für den Ausschnitt-Regler
  useEffect(() => {
    if (page !== 'ton' || a.sound !== 'datei' || file || !id || initial.sound !== 'datei') return;
    let cancelled = false;
    void loadSoundFile(id).then((blob) => blob && audioDuration(blob)).then((d) => !cancelled && d && setDuration(d)).catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [page, a.sound, file, id, initial.sound]);

  const pickFile = (f: File | null) => {
    setFile(f);
    setDuration(0);
    if (!f) return;
    set({ soundName: f.name.replace(/\.[^.]+$/, ''), clipStart: 0 });
    void audioDuration(f).then(setDuration);
  };
  const songBlob = async () => file ?? (id && initial.sound === 'datei' ? await loadSoundFile(id).catch(() => undefined) : undefined);
  const chooseSound = (sound: AlarmSound) => {
    if (sound === a.sound) return;
    const same = sound === initial.sound;
    set({
      sound,
      soundUrl: same ? initial.soundUrl : '',
      soundName: same ? initial.soundName : sound === 'datei' && file ? file.name.replace(/\.[^.]+$/, '') : undefined,
      // Lieder laufen nach dem Stopp standardmäßig weiter – am iPhone kommen Spotify und YouTube erst dann
      keepMusic: a.keepMusic,
    });
  };

  const back = (title: string) => (
    <button type="button" className="ios-back" onClick={() => setPage(null)}>‹ Wecker <span className="muted">· {title}</span></button>
  );

  let body: ReactNode;
  if (page === 'wiederholen') {
    body = (
      <>
        {back('Wiederholen')}
        <div className="chip-row">
          {[
            { label: 'Werktags', days: [1, 2, 3, 4, 5] },
            { label: 'Wochenende', days: [6, 7] },
            { label: 'Täglich', days: [1, 2, 3, 4, 5, 6, 7] },
            { label: 'Einmalig', days: [] },
          ].map((p) => (
            <button key={p.label} type="button" className={`alarm-chip${a.days.join() === p.days.join() ? ' selected' : ''}`} onClick={() => set({ days: p.days })}>{p.label}</button>
          ))}
        </div>
        <ul className="ios-group">
          {WEEKDAY_NAMES.map((w, i) => <CheckRow key={w} label={`Jeden ${w}`} on={a.days.includes(i + 1)} onClick={() => toggleDay(i + 1)} />)}
        </ul>
        {a.days.length === 0 && (
          <ul className="ios-group">
            <li>
              <label className="ios-row">
                <span className="grow">An einem bestimmten Tag<span className="ios-row-hint">Leer = beim nächsten Mal</span></span>
                <input type="date" value={a.date ?? ''} min={today()} onChange={(e) => set({ date: e.target.value || undefined })} />
              </label>
            </li>
          </ul>
        )}
      </>
    );
  } else if (page === 'ton') {
    const song = a.sound !== 'ton';
    const start = clampClipStart(a.clipStart, duration || CLIP_SECONDS);
    body = (
      <>
        {back('Ton')}
        <span className="ios-caption">Klingelt mit</span>
        <ul className="ios-group">
          {SOUND_CHOICES.map((c) => <CheckRow key={c.id} label={c.label} hint={c.hint} on={a.sound === c.id} onClick={() => chooseSound(c.id)} />)}
        </ul>
        {a.sound === 'datei' && (
          <div className="stack-tight">
            <label className="tone-file">
              <input type="file" accept="audio/*" onChange={(e) => pickFile(e.target.files?.[0] ?? null)} aria-label="Lied auswählen" />
              <span>{file || a.soundName ? 'Anderes Lied wählen' : 'Lied auswählen'}</span>
            </label>
            {(file || a.soundName) && <span className="small">✓ <strong>{a.soundName || file?.name}</strong>{duration ? <span className="muted"> · {mmss(duration)}</span> : null}</span>}
            {duration > CLIP_SECONDS + 1 && (
              <label className="tone-clip">
                <span>Ausschnitt <strong>{mmss(start)} – {mmss(start + CLIP_SECONDS)}</strong></span>
                <input type="range" min={0} max={maxClipStart(duration)} step={1} value={start} onChange={(e) => set({ clipStart: Number(e.target.value) })} aria-label="Start des Ausschnitts" />
              </label>
            )}
            {(file || a.soundName) && (
              <button type="button" className="tone-preview" onClick={() => void songBlob().then((b) => b && previewClip(b, start))}>▶ Ausschnitt anhören</button>
            )}
            <span className="muted small">
              Die {CLIP_SECONDS} Sekunden ab {mmss(start)} klingeln bei offener App. Am gesperrten iPhone nimmt iOS selbst gewählte Dateien nicht an – dort klingelt der Ersatzton unten. Soll ein Lied auch dort klingeln, muss es fest in die App eingebaut werden (wie „What Once Was“). Das Lied bleibt nur auf diesem Gerät gespeichert.
            </span>
          </div>
        )}
        {a.sound === 'spotify' && (
          <div className="stack-tight">
            <SpotifyPicker value={spotifyUri(a.soundUrl) ? a.soundUrl : ''} name={a.soundName} onPick={(uri, name) => set({ soundUrl: uri, soundName: name })} />
            <span className="muted small">Spielt über die Spotify-App (Premium nötig). Ist Spotify vorher zu, öffne es einmal kurz, damit das Handy als Gerät auftaucht.</span>
          </div>
        )}
        {a.sound === 'youtube' && (
          <div className="stack-tight">
            <input value={a.soundUrl} placeholder="https://youtu.be/…" inputMode="url" onChange={(e) => set({ soundUrl: e.target.value })} aria-label="YouTube-Link" />
            <span className="muted small">Das Video läuft im Wecker-Fenster.</span>
          </div>
        )}
        {(a.sound === 'spotify' || a.sound === 'youtube') && (
          <p className="ios-note">
            {native
              ? 'Spotify und YouTube kann das iPhone nicht als Weckton abspielen – Apple lässt dafür nur Dateien aus der App zu. Am gesperrten iPhone klingelt deshalb zuerst der Ton unten, nach dem Stopp startet dein Lied. Bei offener App spielt es sofort.'
              : 'Spielt, solange Daywerk offen ist. In der iOS-App klingelt am gesperrten iPhone zuerst der Ton unten, nach dem Stopp startet dein Lied.'}
          </p>
        )}
        <span className="ios-caption">{song ? (native && a.sound !== 'datei' ? 'Ton am gesperrten iPhone' : 'Ersatzton, falls das Lied nicht klappt') : 'Weckton'}</span>
        <ul className="ios-group">
          {[...SONGS.map((x) => ({ ...x, hint: native ? `${x.hint} · dein Lied` : `${x.hint} · klingt nur in der iOS-App` })), ...TONES].map((t) => (
            <li key={t.id}>
              <button type="button" className="ios-row" aria-pressed={toneOf(a.tone) === t.id} onClick={() => { set({ tone: t.id }); previewTone(t.id); }}>
                <span className="tone-play" aria-hidden>▶</span>
                <span className="grow">
                  {t.label}
                  <span className="ios-row-hint">{t.hint}</span>
                </span>
                <span className="ios-check" aria-hidden>{toneOf(a.tone) === t.id ? '✓' : ''}</span>
              </button>
            </li>
          ))}
        </ul>
        {!song && <span className="muted small">Tippen spielt den Ton kurz vor. Er klingelt auch am gesperrten iPhone, im Lautlos-Modus und bei „Nicht stören“.</span>}
        <ul className="ios-group">
          <SwitchRow label="Sanft lauter werden" hint="Bei offener App: beginnt leise, nach 45 Sekunden voll laut" checked={!!a.fadeIn} onChange={(v) => set({ fadeIn: v })} />
          {song && <SwitchRow label="Lied nach dem Stopp weiterspielen" hint="Läuft während der Aufgabe – Spotify auch danach" checked={a.keepMusic !== false} onChange={(v) => set({ keepMusic: v })} />}
        </ul>
      </>
    );
  } else if (page === 'aufgabe') {
    body = (
      <>
        {back('Aufgabe')}
        <ul className="ios-group">
          {CHALLENGES.map((c) => <CheckRow key={c.id} label={c.label} hint={c.hint} on={a.challenge === c.id} onClick={() => set({ challenge: c.id as AlarmChallenge })} />)}
        </ul>
        {(a.challenge === 'rechnen' || a.challenge === 'schuetteln' || a.challenge === 'memory') && (
          <div className="row wrap">
            <label className="grow">Schwierigkeit
              <select value={a.level} onChange={(e) => set({ level: Number(e.target.value) as 1 | 2 | 3 })}>
                {a.challenge === 'rechnen' && <><option value={1}>Leicht (34 + 27)</option><option value={2}>Mittel (7 × 13 + 21)</option><option value={3}>Schwer (23 × 17)</option></>}
                {a.challenge === 'schuetteln' && <><option value={1}>Leicht ({shakeTarget(1)}-mal)</option><option value={2}>Mittel ({shakeTarget(2)}-mal)</option><option value={3}>Schwer ({shakeTarget(3)}-mal)</option></>}
                {a.challenge === 'memory' && <><option value={1}>Leicht ({memoryLength(1)} Farben)</option><option value={2}>Mittel ({memoryLength(2)} Farben)</option><option value={3}>Schwer ({memoryLength(3)} Farben)</option></>}
              </select>
            </label>
            {a.challenge === 'rechnen' && <label>Anzahl<input type="number" min={1} max={10} value={a.rounds} onChange={(e) => set({ rounds: Math.min(10, Math.max(1, Number(e.target.value) || 1)) })} /></label>}
          </div>
        )}
        {a.challenge === 'text' && <label>Eigener Satz<input value={a.phrase} placeholder="leer = jedes Mal ein zufälliger Satz" onChange={(e) => set({ phrase: e.target.value })} /></label>}
        {a.challenge === 'qr' && (
          <div className="stack-tight">
            {scanning ? <QrScanner onResult={(text) => { set({ qr: text }); setScanning(false); }} /> : <button type="button" onClick={() => setScanning(true)}>{a.qr ? 'Anderen Code scannen' : 'QR-Code scannen'}</button>}
            <span className="muted small">{a.qr ? '✓ Code hinterlegt. ' : ''}Nimm einen QR-Code, der weit weg vom Bett hängt – z. B. im Bad oder auf einer Packung in der Küche.</span>
          </div>
        )}
        {a.challenge === 'schuetteln' && <span className="muted small">Meldet das Gerät keine Bewegung (z. B. am PC), kommt stattdessen eine Rechenaufgabe.</span>}
        <span className="muted small">
          {a.challenge === 'keine'
            ? 'Ohne Aufgabe: „Stopp“ schaltet ihn sofort aus.'
            : `Nach „Stopp“ hast du ${a.challenge === 'qr' ? '60' : a.challenge === 'schuetteln' || a.challenge === 'memory' ? '30' : '15'} Sekunden – jede Eingabe setzt die Zeit zurück. Sonst klingelt er wieder.`}
        </span>
      </>
    );
  } else {
    const cycles = cycleTimes(now);
    body = (
      <>
        <WheelTime value={a.time} onChange={(time) => set({ time })} />
        <div className="cycle-row">
          <span className="muted small">Jetzt ins Bett? Aufwachen am Ende eines Schlafzyklus:</span>
          <div className="chip-row">
            {cycles.map((c) => (
              <button key={c.cycles} type="button" className={`alarm-chip${a.time === hhmm(c.at) ? ' selected' : ''}`} onClick={() => set({ time: hhmm(c.at) })} title={`${c.cycles} Zyklen · ${durationLabel(c.cycles * 90)} Schlaf`}>
                {hhmm(c.at)} <span className="muted">{durationLabel(c.cycles * 90).replace(' 0 Min.', '')}</span>
              </button>
            ))}
          </div>
        </div>
        <ul className="ios-group">
          <NavRow label="Wiederholen" value={repeatLabel(a)} onClick={() => setPage('wiederholen')} />
          <li>
            <label className="ios-row">
              <span>Name</span>
              <input className="ios-row-input" value={a.label} placeholder="Wecker" onChange={(e) => set({ label: e.target.value })} />
            </label>
          </li>
          <NavRow label="Ton" value={soundLabel(a as Alarm)} onClick={() => setPage('ton')} />
          <NavRow label="Aufgabe" value={challengeLabel(a)} onClick={() => setPage('aufgabe')} />
        </ul>
        <ul className="ios-group">
          <SwitchRow label="Schlummern" checked={snooze.on} onChange={(v) => set({ snooze: v, snoozeMinutes: a.snoozeMinutes ?? 9, snoozeMax: a.snoozeMax ?? 3 })}>
            <div className="ios-sub">
              <label>Dauer
                <select value={snooze.minutes} onChange={(e) => set({ snoozeMinutes: Number(e.target.value) })}>
                  {SNOOZE_MINUTES.map((m) => <option key={m} value={m}>{m} Min.</option>)}
                </select>
              </label>
              <label>Höchstens
                <select value={snooze.max} onChange={(e) => set({ snoozeMax: Number(e.target.value) })}>
                  {[1, 2, 3, 5, 10].map((m) => <option key={m} value={m}>{m}-mal</option>)}
                </select>
              </label>
            </div>
          </SwitchRow>
          <SwitchRow label="Sanft lauter werden" checked={!!a.fadeIn} onChange={(v) => set({ fadeIn: v })} />
          <SwitchRow label="Wach-Check" hint="Fragt nach dem Ausschalten, ob du wach bist – sonst klingelt er wieder" checked={!!a.wakeCheck} onChange={(v) => set({ wakeCheck: v, wakeCheckMinutes: a.wakeCheckMinutes ?? 5 })}>
            <div className="ios-sub">
              <label>Fragen nach
                <select value={a.wakeCheckMinutes ?? 5} onChange={(e) => set({ wakeCheckMinutes: Number(e.target.value) })}>
                  {WAKE_CHECK_MINUTES.map((m) => <option key={m} value={m}>{m} Min.</option>)}
                </select>
              </label>
            </div>
          </SwitchRow>
          <SwitchRow label="Guten-Morgen-Bildschirm" hint="Termine, Aufgaben und Gewohnheiten nach dem Ausschalten" checked={a.morning !== false} onChange={(v) => set({ morning: v })} />
        </ul>
        {error && <p className="alert">{error}</p>}
        {hint && <p className="alert update">{hint}</p>}
        <ul className="ios-group">
          <li><button type="button" className="ios-row ios-action" onClick={() => {
            const p = problem();
            if (p) return setError(p);
            // Neu gewähltes Lied: zum Testen unter eigener ID ablegen, das gespeicherte bleibt
            if (a.sound === 'datei' && file) void saveSoundFile('test', file).then(() => testAlarm({ ...a, id: 'test', qr: a.qr }));
            else testAlarm({ ...a, id: id ?? 'test', qr: a.qr });
          }}>Hier testen</button></li>
          {native && (
            <li>
              <button
                type="button"
                className="ios-row ios-action"
                onClick={() => {
                  const p = problem();
                  if (p) return setError(p);
                  const testId = id ?? 'test';
                  const clip = a.sound === 'datei' ? songBlob().then((b) => (b ? saveNativeClip(testId, b, a.clipStart ?? 0) : undefined)).catch(() => undefined) : Promise.resolve();
                  clip
                    .then(() => testNativeAlarm({ ...a, id: testId }))
                    .then((s) => setHint(`Der iPhone-Wecker klingelt in ${s} Sekunden – sperr ruhig das Handy.`))
                    .catch(() => setError('Der iPhone-Wecker ließ sich nicht stellen.'));
                }}
              >
                Am iPhone testen
              </button>
            </li>
          )}
          {id && a.days.length > 0 && initial.enabled && (
            <li>
              <button type="button" className="ios-row ios-action" onClick={() => set(isSkipping({ ...a, id }, now) ? { skip: undefined } : skipNext({ ...a, id, enabled: true }, now))}>
                {isSkipping({ ...a, id }, now) ? `Auslassen am ${parseDate(a.skip!).toLocaleDateString('de-DE', { weekday: 'short', day: 'numeric', month: 'numeric' })} aufheben` : 'Nur den nächsten auslassen'}
              </button>
            </li>
          )}
          {id && (
            <li><button type="button" className="ios-row ios-action danger-text" onClick={() => { if (confirm('Wecker löschen?')) { remove('alarms', id); void deleteSoundFile(id); void removeNativeClip(id); onClose(); } }}>Wecker löschen</button></li>
          )}
        </ul>
      </>
    );
  }

  return (
    <Sheet title={id ? 'Wecker bearbeiten' : 'Neuer Wecker'} submitLabel="Sichern" onClose={onClose} onSubmit={() => void save()}>
      <div className="alarm-sheet">{body}</div>
    </Sheet>
  );
}

/** Uhr wie iOS StandBy: groß, gedimmt und rot, damit sie nachts nicht blendet. Der Bildschirm bleibt an. */
function NightMode({ alarms, onClose }: { alarms: Alarm[]; onClose: () => void }) {
  const [now, setNow] = useState(() => new Date());
  const [awake, setAwake] = useState(true);
  const [dim, setDim] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    type Lock = { release: () => Promise<void> };
    const nav = navigator as Navigator & { wakeLock?: { request: (type: 'screen') => Promise<Lock> } };
    let lock: Lock | null = null;
    const acquire = () => {
      if (!nav.wakeLock) return setAwake(false);
      nav.wakeLock.request('screen').then((l) => (lock = l)).catch(() => setAwake(false));
    };
    const onVisible = () => document.visibilityState === 'visible' && acquire();
    acquire();
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      clearInterval(id);
      document.removeEventListener('visibilitychange', onVisible);
      lock?.release().catch(() => undefined);
    };
  }, []);
  const next = nextAlarm(alarms, now);
  return (
    <div className={`alarm-night dim-${dim}`} role="dialog" aria-modal="true" aria-label="Nachtmodus" onClick={() => setDim((d) => (d + 1) % 3)}>
      <span className="alarm-night-date">{now.toLocaleDateString('de-DE', { weekday: 'long', day: 'numeric', month: 'long' })}</span>
      <span className="alarm-night-clock">{hhmm(now)}</span>
      <span className="alarm-night-next">{next ? `⏰ ${next.alarm.time} · ${untilLabel(next.at, now)}` : 'Kein Wecker an'}</span>
      <span className="small alarm-night-hint">
        {awake ? 'Tippen dimmt die Uhr. Handy ans Ladekabel und Daywerk offen lassen.' : 'Dieses Handy kann den Bildschirm nicht wach halten – stell die automatische Sperre auf „Nie“.'}
      </span>
      <button type="button" onClick={(e) => { e.stopPropagation(); onClose(); }}>Beenden</button>
    </div>
  );
}

/** Zeile der Weckerliste: nach links wischen zeigt „Auslassen“ und „Löschen“ */
function AlarmRow({ alarm, now, onEdit }: { alarm: Alarm; now: Date; onEdit: () => void }) {
  const { update, remove } = useStore();
  const [dx, setDx] = useState(0);
  const touch = useRef<{ x: number; y: number; base: number; swiping: boolean } | null>(null);
  const OPEN = -150;
  const next = nextRing(alarm, now);
  const skipping = isSkipping(alarm, now);
  const paused = isPaused(alarm, now);
  const fmt = (d: string) => parseDate(d).toLocaleDateString('de-DE', { weekday: 'short', day: 'numeric', month: 'numeric' });
  const status = !alarm.enabled ? '' : paused ? `Pausiert bis ${fmt(alarm.pausedUntil!)}` : skipping ? `Lässt ${fmt(alarm.skip!)} aus` : next ? untilLabel(next, now) : '';

  const onStart = (e: TouchEvent) => (touch.current = { x: e.touches[0].clientX, y: e.touches[0].clientY, base: dx, swiping: false });
  const onMove = (e: TouchEvent) => {
    const t = touch.current;
    if (!t) return;
    const mx = e.touches[0].clientX - t.x;
    if (!t.swiping && Math.abs(mx) > 8 && Math.abs(mx) > Math.abs(e.touches[0].clientY - t.y)) t.swiping = true;
    if (t.swiping) setDx(Math.min(0, Math.max(OPEN - 30, t.base + mx)));
  };
  const onEnd = () => {
    if (touch.current?.swiping) setDx((d) => (d < OPEN / 2 ? OPEN : 0));
    touch.current = null;
  };

  return (
    <li className={`alarm-item${alarm.enabled ? '' : ' off'}`}>
      <div className="alarm-actions" aria-hidden={dx === 0}>
        {alarm.days.length > 0 && alarm.enabled && (
          <button type="button" className="alarm-act-skip" tabIndex={dx === 0 ? -1 : 0} onClick={() => { update('alarms', alarm.id, skipping ? { skip: undefined } : skipNext(alarm, now)); setDx(0); }}>
            {skipping ? 'Nicht auslassen' : 'Auslassen'}
          </button>
        )}
        <button type="button" className="alarm-act-delete" tabIndex={dx === 0 ? -1 : 0} onClick={() => { remove('alarms', alarm.id); void deleteSoundFile(alarm.id); void removeNativeClip(alarm.id); }}>Löschen</button>
      </div>
      <div className="alarm-slide" style={{ transform: `translateX(${dx}px)`, transition: touch.current?.swiping ? 'none' : undefined }} onTouchStart={onStart} onTouchMove={onMove} onTouchEnd={onEnd}>
        <button type="button" className="alarm-row grow" onClick={() => (dx ? setDx(0) : onEdit())}>
          <span className="alarm-row-time">{alarm.time}</span>
          <span className="alarm-row-sub">
            {[alarm.label, repeatLabel(alarm), CHALLENGES.find((c) => c.id === alarm.challenge)?.label].filter(Boolean).join(' · ')}
          </span>
          {status && <span className={`alarm-row-status${paused || skipping ? ' warn' : ''}`}>{status}</span>}
        </button>
        <input
          type="checkbox"
          className="switch"
          checked={alarm.enabled}
          onChange={(e) => {
            if (e.target.checked) unlockAlarmAudio();
            update('alarms', alarm.id, { enabled: e.target.checked, armedAt: Date.now() });
          }}
          aria-label={`Wecker ${alarm.time} ${alarm.enabled ? 'ausschalten' : 'einschalten'}`}
        />
      </div>
    </li>
  );
}

function WakeStatsPanel() {
  const { data } = useStore();
  if (data.wakeLogs.length === 0) return null;
  const s = wakeStats(data.wakeLogs, new Date());
  return (
    <Panel title="Aufstehen">
      <div className="wake-stats">
        <div><strong>{s.avgWake ?? '–'}</strong><span>Ø aufgestanden</span></div>
        <div><strong>{String(s.avgSnoozes).replace('.', ',')}</strong><span>Ø geschlummert</span></div>
        <div><strong>{s.streak}</strong><span>pünktlich in Folge</span></div>
      </div>
      <ul className="wake-days">
        {s.recent.slice(0, 7).map((l) => {
          const late = Math.max(0, Math.round((l.offAt - l.ringAt) / 60_000));
          return (
            <li key={l.id}>
              <span className={`wake-dot${isPunctual(l) ? ' ok' : ''}`} aria-label={isPunctual(l) ? 'pünktlich' : 'spät'} />
              <span className="grow">{parseDate(l.date).toLocaleDateString('de-DE', { weekday: 'short', day: 'numeric', month: 'numeric' })}</span>
              <span className="muted small">{l.snoozes > 0 ? `${l.snoozes}× geschlummert · ` : ''}{late > 0 ? `+${late} Min.` : 'sofort'}</span>
              <strong className="wake-time">{hhmm(new Date(l.offAt))}</strong>
            </li>
          );
        })}
      </ul>
      <p className="muted small">Pünktlich heißt: nicht geschlummert und spätestens 10 Minuten nach dem Klingeln aus. Gezählt wird, wenn du den Wecker in Daywerk ausschaltest.</p>
    </Panel>
  );
}

export function Alarms() {
  const { data, add, updateSettings, mutate } = useStore();
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState<ID | null>(null);
  const [night, setNight] = useState(false);
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(id);
  }, []);
  const editing = data.alarms.find((a) => a.id === editingId);
  const alarms = [...data.alarms].sort((x, y) => x.time.localeCompare(y.time));
  const mobile = isMobile();
  const [real, setReal] = useState<AlarmPermission | null>(() => (isNativeApp() ? null : 'unavailable'));
  useEffect(() => {
    void nativeAlarmPermission(false).then(setReal);
  }, [data.alarms]);
  const native = real === 'granted';
  const [failed, setFailed] = useState(0);
  useEffect(() => {
    const onSync = (e: Event) => setFailed((e as CustomEvent<number>).detail);
    window.addEventListener(SYNC_EVENT, onSync);
    return () => window.removeEventListener(SYNC_EVENT, onSync);
  }, []);

  const sleep = data.settings.sleep ?? defaultSleep();
  const setSleep = (patch: Partial<typeof sleep>) => updateSettings({ sleep: { ...sleep, ...patch } });
  const next = nextAlarm(data.alarms, now);
  const bed = next ? bedtimeFor(next.at, sleep.goal) : null;
  const pausedUntil = data.alarms.map((a) => (isPaused(a, now) ? a.pausedUntil! : '')).sort().at(-1) ?? '';
  const pauseAll = (until: string) => mutate((d) => ({ ...d, alarms: d.alarms.map((a) => ({ ...a, pausedUntil: until || undefined })) }));
  const asleepIn = next ? (next.at.getTime() - now.getTime()) / 60_000 - 15 : 0;

  return (
    <>
      <PageHeader title="Wecker" subtitle="Aufstehen mit Aufgabe" actions={<AddButton label="Neuer Wecker" onClick={() => setAdding(true)} />} />
      {!mobile && <p className="alert update">Der Wecker klingelt nur am Handy. Hier kannst du ihn einstellen und mit „Hier testen“ ausprobieren.</p>}

      <section className="alarm-next">
        {next ? (
          <>
            <span className="alarm-next-label">Nächster Wecker</span>
            <strong>
              {next.at.toLocaleDateString('de-DE', { weekday: 'long' })} {next.alarm.time}
              <span className="muted"> · {untilLabel(next.at, now)}</span>
            </strong>
            <span className="muted small">
              {bed && bed > now
                ? `Für ${durationLabel(sleep.goal)} Schlaf um ${hhmm(bed)} ins Bett.`
                : `Wenn du jetzt schläfst: ${durationLabel(Math.max(0, asleepIn))} Schlaf.`}
            </span>
          </>
        ) : (
          <>
            <span className="alarm-next-label">Nächster Wecker</span>
            <strong>Kein Wecker an</strong>
          </>
        )}
        {pausedUntil && (
          <span className="alarm-paused">
            Alle Wecker pausiert bis {parseDate(pausedUntil).toLocaleDateString('de-DE', { weekday: 'short', day: 'numeric', month: 'numeric' })}
            <button type="button" className="link-btn" onClick={() => pauseAll('')}>Fortsetzen</button>
          </span>
        )}
      </section>

      <div className="alarm-quick">
        <span className="muted small">Power-Nap</span>
        {[20, 30, 60].map((m) => (
          <button key={m} type="button" className="alarm-chip" onClick={() => { unlockAlarmAudio(); add('alarms', quickAlarm(m, new Date())); }}>
            in {m} Min.
          </button>
        ))}
      </div>

      {alarms.length === 0 ? <Panel><Empty>Noch kein Wecker. Tippe auf +.</Empty></Panel> : (
        <ul className="alarm-list">
          {alarms.map((a) => <AlarmRow key={a.id} alarm={a} now={now} onEdit={() => setEditingId(a.id)} />)}
        </ul>
      )}
      {mobile && alarms.length > 0 && <p className="muted small alarm-swipe-hint">Nach links wischen zum Auslassen oder Löschen.</p>}

      <Panel title="Schlaf">
        <ul className="ios-group flush">
          <li>
            <label className="ios-row">
              <span className="grow">Schlafziel</span>
              <select value={sleep.goal} onChange={(e) => setSleep({ goal: Number(e.target.value) })}>
                {SLEEP_GOALS.map((g) => <option key={g} value={g}>{durationLabel(g)}</option>)}
              </select>
            </label>
          </li>
          <SwitchRow label="Erinnerung zur Schlafenszeit" hint="Mitteilung, wenn es Zeit fürs Bett ist" checked={sleep.remind} onChange={(v) => setSleep({ remind: v })} />
          <li>
            <label className="ios-row">
              <span className="grow">Alle Wecker pausieren bis<span className="ios-row-hint">z. B. für den Urlaub</span></span>
              <input type="date" value={pausedUntil} min={today()} max={addDays(today(), 365)} onChange={(e) => pauseAll(e.target.value)} />
            </label>
          </li>
        </ul>
      </Panel>

      <WakeStatsPanel />

      {isNativeApp() && real !== null && real !== 'unavailable' && (
        <Panel title="Echter iPhone-Wecker">
          {native && failed > 0 && (
            <p className="alert">{failed === 1 ? 'Ein Wecker ließ' : `${failed} Wecker ließen`} sich am iPhone nicht stellen und klingeln nicht. Öffne Daywerk später erneut oder schalte den Wecker aus und wieder ein.</p>
          )}
          {native ? (
            <p className="small">
              Deine Wecker sind als echte iPhone-Wecker gestellt: Sie klingeln laut, auch wenn das Handy gesperrt ist, im Lautlos-Modus und bei „Nicht stören“.
              Mit Schlummern zeigt das iPhone <strong>Schlummern</strong> statt „Aufgabe lösen“ – nach <strong>Stopp</strong> kommt dann eine Mitteilung, die Daywerk bei der Aufgabe öffnet.
              Löst du die Aufgabe nicht innerhalb einer Minute, klingelt er wieder. Ausgelassene und pausierte Wecker stellt Daywerk als einzelne Termine für die nächsten zwei Wochen – öffne die App ab und zu.
            </p>
          ) : real === 'denied' ? (
            <p className="small">Daywerk darf keine Wecker stellen. Erlaube es unter Einstellungen → Apps → Daywerk → Wecker, dann klingeln sie auch bei gesperrtem Handy.</p>
          ) : (
            <>
              <p className="small">Erlaube Daywerk, echte Wecker zu stellen – dann klingeln sie auch bei gesperrtem Handy und im Lautlos-Modus.</p>
              <button type="button" className="primary" onClick={() => void nativeAlarmPermission(true).then(setReal)}>Wecker erlauben</button>
            </>
          )}
        </Panel>
      )}
      {mobile && !native && (
        <Panel title="Damit er klingelt">
          <p className="small">
            Daywerk ist eine Web-App: Das Handy hält sie an, sobald der Bildschirm aus ist oder du eine andere App öffnest. Starte darum
            vor dem Schlafen den <strong>Nachtmodus</strong>, lass das Handy am Ladekabel und Daywerk offen. Lautstärke vorher aufdrehen.
          </p>
          <button type="button" className="primary" onClick={() => { unlockAlarmAudio(); setNight(true); }}>Nachtmodus starten</button>
        </Panel>
      )}
      {!mobile && (
        <button type="button" className="link-btn" onClick={() => setNight(true)}>Nachtmodus ansehen</button>
      )}
      {adding && <AlarmSheet initial={defaultAlarm()} native={native} onClose={() => setAdding(false)} />}
      {editing && <AlarmSheet key={editing.id} id={editing.id} initial={editing} native={native} onClose={() => setEditingId(null)} />}
      {night && <NightMode alarms={data.alarms} onClose={() => setNight(false)} />}
    </>
  );
}
