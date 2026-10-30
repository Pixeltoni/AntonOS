import { useEffect, useState } from 'react';
import { useStore } from '../store';
import type { Alarm, AlarmSound, ID } from '../types';
import { CHALLENGES, daysLabel, defaultAlarm, nextRing, spotifyUri, untilLabel, WEEKDAYS, youtubeId } from '../lib/alarm';
import { isMobile } from '../lib/notify';
import { deleteSoundFile, QrScanner, saveSoundFile, testAlarm, unlockAlarmAudio } from '../components/alarm';
import { useSpotify } from '../components/spotify';
import { Empty, PageHeader, Panel } from '../components/ui';
import { AddButton, Sheet } from '../components/sheet';

const SOUNDS: { id: AlarmSound; label: string }[] = [
  { id: 'ton', label: 'Standard' },
  { id: 'datei', label: 'Datei' },
  { id: 'youtube', label: 'YouTube' },
  { id: 'spotify', label: 'Spotify' },
];

const soundLabel = (a: Alarm) => (a.sound === 'datei' ? a.soundName || 'Eigene Datei' : SOUNDS.find((s) => s.id === a.sound)?.label ?? 'Standard');

type Draft = Omit<Alarm, 'id'>;

function AlarmSheet({ initial, id, onClose }: { initial: Draft; id?: ID; onClose: () => void }) {
  const { add, update, remove } = useStore();
  const spotify = useSpotify();
  const [a, setA] = useState<Draft>(initial);
  const [file, setFile] = useState<File | null>(null);
  const [scanning, setScanning] = useState(false);
  const [error, setError] = useState('');
  const set = (patch: Partial<Draft>) => setA((x) => ({ ...x, ...patch }));
  const toggleDay = (d: number) => set({ days: a.days.includes(d) ? a.days.filter((x) => x !== d) : [...a.days, d].sort() });

  const problem = (): string => {
    if (!/^\d\d:\d\d$/.test(a.time)) return 'Bitte eine Uhrzeit wählen.';
    if (a.sound === 'datei' && !file && !a.soundName) return 'Bitte eine Audiodatei auswählen.';
    if (a.sound === 'youtube' && !youtubeId(a.soundUrl)) return 'Bitte einen gültigen YouTube-Link einfügen.';
    if (a.sound === 'spotify' && !spotifyUri(a.soundUrl)) return 'Bitte einen Spotify-Link zu einem Song, Album oder einer Playlist einfügen.';
    if (a.challenge === 'qr' && !a.qr) return 'Bitte zuerst einen QR-Code scannen.';
    return '';
  };

  const save = async () => {
    const p = problem();
    if (p) return setError(p);
    unlockAlarmAudio();
    const final: Draft = { ...a, label: a.label.trim(), phrase: a.phrase.trim(), enabled: true, armedAt: Date.now(), soundName: file?.name ?? a.soundName };
    const alarmId = id ?? add('alarms', final);
    if (id) update('alarms', id, final);
    if (file) await saveSoundFile(alarmId, file).catch(() => setError('Die Datei ließ sich nicht speichern.'));
    onClose();
  };

  return (
    <Sheet title={id ? 'Wecker bearbeiten' : 'Neuer Wecker'} submitLabel={id ? 'Sichern' : 'Hinzufügen'} onClose={onClose} onSubmit={() => void save()}>
      <input className="alarm-time-input" type="time" value={a.time} onChange={(e) => set({ time: e.target.value })} aria-label="Weckzeit" required />
      <label>Name<input value={a.label} placeholder="z. B. Uni" onChange={(e) => set({ label: e.target.value })} /></label>
      <div className="stack-tight">
        <span className="muted small">Wiederholen: {daysLabel(a.days)}</span>
        <div className="alarm-days">
          {WEEKDAYS.map((w, i) => (
            <button key={w} type="button" className={a.days.includes(i + 1) ? 'selected' : ''} aria-pressed={a.days.includes(i + 1)} onClick={() => toggleDay(i + 1)}>{w}</button>
          ))}
        </div>
      </div>

      <div className="stack-tight">
        <span className="muted small">Klang</span>
        <div className="segmented">
          {SOUNDS.map((s) => <button key={s.id} type="button" className={a.sound === s.id ? 'selected' : ''} onClick={() => set({ sound: s.id })}>{s.label}</button>)}
        </div>
        {a.sound === 'ton' && <span className="muted small">Lauter Piepton – klappt am zuverlässigsten, auch im Lautlos-Modus.</span>}
        {a.sound === 'datei' && (
          <>
            <input type="file" accept="audio/*" onChange={(e) => setFile(e.target.files?.[0] ?? null)} aria-label="Audiodatei" />
            <span className="muted small">{file?.name ?? a.soundName ?? 'Noch keine Datei.'} Die Datei bleibt nur auf diesem Gerät gespeichert.</span>
          </>
        )}
        {a.sound === 'youtube' && (
          <>
            <input value={a.soundUrl} placeholder="https://youtu.be/…" inputMode="url" onChange={(e) => set({ soundUrl: e.target.value })} aria-label="YouTube-Link" />
            <span className="muted small">Das Video läuft im Wecker-Fenster. Blockiert das Handy den Ton, klingelt stattdessen der Standard-Ton.</span>
          </>
        )}
        {a.sound === 'spotify' && (
          <>
            <input value={a.soundUrl} placeholder="https://open.spotify.com/track/…" inputMode="url" onChange={(e) => set({ soundUrl: e.target.value })} aria-label="Spotify-Link" />
            <span className="muted small">
              Spielt über die Spotify-App auf deinem Handy (Premium nötig). {spotify.connected ? 'Spotify ist verbunden.' : <>Erst unter <a href="#/musik">Musik</a> mit Spotify verbinden.</>} Findet Spotify kein Gerät, klingelt der Standard-Ton.
            </span>
          </>
        )}
      </div>

      <div className="stack-tight">
        <span className="muted small">Aufgabe zum Abschalten</span>
        <div className="segmented">
          {CHALLENGES.map((c) => <button key={c.id} type="button" className={a.challenge === c.id ? 'selected' : ''} onClick={() => set({ challenge: c.id })}>{c.label}</button>)}
        </div>
        {a.challenge === 'rechnen' && (
          <div className="row wrap">
            <label className="grow">Schwierigkeit
              <select value={a.level} onChange={(e) => set({ level: Number(e.target.value) as 1 | 2 | 3 })}>
                <option value={1}>Leicht (34 + 27)</option>
                <option value={2}>Mittel (7 × 13 + 21)</option>
                <option value={3}>Schwer (23 × 17)</option>
              </select>
            </label>
            <label>Anzahl<input type="number" min={1} max={10} value={a.rounds} onChange={(e) => set({ rounds: Math.min(10, Math.max(1, Number(e.target.value) || 1)) })} /></label>
          </div>
        )}
        {a.challenge === 'text' && (
          <label>Eigener Satz<input value={a.phrase} placeholder="leer = jedes Mal ein zufälliger Satz" onChange={(e) => set({ phrase: e.target.value })} /></label>
        )}
        {a.challenge === 'qr' && (
          <>
            {scanning ? (
              <QrScanner onResult={(text) => { set({ qr: text }); setScanning(false); }} />
            ) : (
              <button type="button" onClick={() => setScanning(true)}>{a.qr ? 'Anderen Code scannen' : 'QR-Code scannen'}</button>
            )}
            <span className="muted small">
              {a.qr ? '✓ Code hinterlegt. ' : ''}Nimm einen QR-Code, der weit weg vom Bett hängt – z. B. ausgedruckt im Bad oder auf einer Packung in der Küche.
            </span>
          </>
        )}
        <span className="muted small">Nach „Ausschalten“ hast du {a.challenge === 'qr' ? '60' : '15'} Sekunden – jede Eingabe setzt die Zeit zurück. Sonst klingelt er wieder.</span>
      </div>

      {error && <p className="alert">{error}</p>}
      <div className="row between">
        <button type="button" onClick={() => { const p = problem(); if (p) setError(p); else testAlarm({ ...a, id: id ?? 'test', qr: a.qr }); }}>Testen</button>
        {id && (
          <button type="button" className="danger" onClick={() => { if (confirm('Wecker löschen?')) { remove('alarms', id); void deleteSoundFile(id); onClose(); } }}>Löschen</button>
        )}
      </div>
    </Sheet>
  );
}

/** Uhr über den ganzen Bildschirm; der Bildschirm bleibt an, damit der Wecker klingeln kann. */
function NightMode({ alarms, onClose }: { alarms: Alarm[]; onClose: () => void }) {
  const [now, setNow] = useState(() => new Date());
  const [awake, setAwake] = useState(true);
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
  const next = alarms.map((a) => ({ a, at: nextRing(a, now) })).filter((x) => x.at).sort((x, y) => x.at!.getTime() - y.at!.getTime())[0];
  return (
    <div className="alarm-night" role="dialog" aria-modal="true" aria-label="Nachtmodus">
      <span className="alarm-night-clock">{now.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })}</span>
      <span>{next ? `⏰ ${next.a.time} · ${untilLabel(next.at!, now)}` : 'Kein Wecker an'}</span>
      <span className="small">
        {awake ? 'Bildschirm bleibt an. Handy ans Ladekabel und AntonOS offen lassen.' : 'Dieses Handy kann den Bildschirm nicht wach halten – stell die automatische Sperre in den Einstellungen auf „Nie“.'}
      </span>
      <button type="button" onClick={onClose}>Beenden</button>
    </div>
  );
}

export function Alarms() {
  const { data, update } = useStore();
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

  return (
    <>
      <PageHeader title="Wecker" subtitle="Aufstehen mit Aufgabe" actions={<AddButton label="Neuer Wecker" onClick={() => setAdding(true)} />} />
      {!mobile && <p className="alert update">Der Wecker klingelt nur am Handy. Hier kannst du ihn einstellen und mit „Testen“ ausprobieren.</p>}
      <Panel title="Deine Wecker">
        {alarms.length === 0 ? <Empty>Noch kein Wecker. Tippe auf +.</Empty> : (
          <ul className="list alarm-list">
            {alarms.map((a) => {
              const next = nextRing(a, now);
              return (
                <li key={a.id} className={a.enabled ? '' : 'off'}>
                  <button type="button" className="alarm-row grow" onClick={() => setEditingId(a.id)}>
                    <span className="alarm-row-time">{a.time}</span>
                    <span className="muted small">
                      {[a.label, daysLabel(a.days), CHALLENGES.find((c) => c.id === a.challenge)?.label, soundLabel(a)].filter(Boolean).join(' · ')}
                      {next ? ` · ${untilLabel(next, now)}` : ''}
                    </span>
                  </button>
                  <input
                    type="checkbox"
                    className="switch"
                    checked={a.enabled}
                    onChange={(e) => {
                      if (e.target.checked) unlockAlarmAudio();
                      update('alarms', a.id, { enabled: e.target.checked, armedAt: Date.now() });
                    }}
                    aria-label={`Wecker ${a.time} ${a.enabled ? 'ausschalten' : 'einschalten'}`}
                  />
                </li>
              );
            })}
          </ul>
        )}
      </Panel>
      {mobile && (
        <Panel title="Damit er klingelt">
          <p className="small">
            AntonOS ist eine Web-App: Das Handy hält sie an, sobald der Bildschirm aus ist oder du eine andere App öffnest. Starte darum
            vor dem Schlafen den <strong>Nachtmodus</strong>, lass das Handy am Ladekabel und AntonOS offen. Lautstärke vorher aufdrehen.
          </p>
          <button type="button" className="primary" onClick={() => { unlockAlarmAudio(); setNight(true); }}>Nachtmodus starten</button>
        </Panel>
      )}
      {adding && <AlarmSheet initial={defaultAlarm()} onClose={() => setAdding(false)} />}
      {editing && <AlarmSheet key={editing.id} id={editing.id} initial={editing} onClose={() => setEditingId(null)} />}
      {night && <NightMode alarms={data.alarms} onClose={() => setNight(false)} />}
    </>
  );
}
