import { useEffect, useState } from 'react';
import { newId, useStore } from '../store';
import type { Place } from '../types';
import { extras, isNativeApp, type NativePermission } from '../lib/native';
import { defaultLock, LOCKABLE } from '../lib/lock';
import { defaultHealth, stepsLabel } from '../lib/health';
import { MAX_PLACES, PLACE_KINDS } from '../lib/places';
import { today } from '../lib/dates';
import { useToast } from './toast';

const onlyApp = <p className="muted small">Nur in der iPhone-App verfügbar.</p>;

/** Face ID für Finanzen, Tagebuch und Co. */
export function LockPanel() {
  const { data, updateSettings } = useStore();
  const { show } = useToast();
  const lock = data.settings.lock ?? defaultLock();
  const [kind, setKind] = useState<string>('none');
  useEffect(() => void extras((p) => p.biometry(), { kind: 'none' as const }).then((r) => setKind(r.kind)), []);
  if (!isNativeApp()) return onlyApp;
  const name = kind === 'touchID' ? 'Touch ID' : kind === 'opticID' ? 'Optic ID' : 'Face ID';
  const toggle = async (enabled: boolean) => {
    if (enabled) {
      const { ok } = await extras((p) => p.authenticate({ reason: `${name} für Daywerk einschalten` }), { ok: false });
      if (!ok) return show(kind === 'none' ? 'Auf diesem iPhone ist kein Code bzw. Face ID eingerichtet.' : `${name} hat nicht geklappt.`);
    }
    updateSettings({ lock: { ...lock, enabled } });
  };
  return (
    <div className="iphone-stack">
      <label className="row">
        <input type="checkbox" checked={lock.enabled} onChange={(e) => void toggle(e.target.checked)} />
        Private Bereiche mit {name} sperren
      </label>
      {lock.enabled && (
        <div className="row wrap">
          {LOCKABLE.map((p) => (
            <label key={p.path} className="chip-check">
              <input
                type="checkbox"
                checked={lock.pages.includes(p.path)}
                onChange={(e) => updateSettings({ lock: { ...lock, pages: e.target.checked ? [...lock.pages, p.path] : lock.pages.filter((x) => x !== p.path) } })}
              />
              {p.label}
            </label>
          ))}
        </div>
      )}
      <p className="muted small">Gesperrte Bereiche öffnen sich nach {name} und bleiben offen, bis Daywerk eine Minute im Hintergrund war. Auch die Suche zeigt sie erst danach.</p>
    </div>
  );
}

/** Apple Health: Workouts, Schritte, Schlaf */
export function HealthPanel() {
  const { data, updateSettings } = useStore();
  const { show } = useToast();
  const health = { ...defaultHealth(), ...data.settings.health };
  const [state, setState] = useState<NativePermission>('unavailable');
  useEffect(() => void extras((p) => p.healthStatus(), { state: 'unavailable' as NativePermission }).then((r) => setState(r.state)), []);
  if (!isNativeApp()) return onlyApp;
  const connect = async () => {
    const r = await extras((p) => p.healthAuthorize(), { state: 'unavailable' as NativePermission });
    setState(r.state);
    if (r.state === 'unavailable') return show('Apple Health ist auf diesem Gerät nicht verfügbar.');
    updateSettings({ health: { ...health, enabled: true } });
  };
  const todayValues = data.healthDays.find((d) => d.date === today());
  return (
    <div className="iphone-stack">
      {health.enabled ? (
        <>
          <div className="row wrap">
            {(['workouts', 'steps', 'sleep'] as const).map((k) => (
              <label key={k} className="chip-check">
                <input type="checkbox" checked={health[k]} onChange={(e) => updateSettings({ health: { ...health, [k]: e.target.checked } })} />
                {k === 'workouts' ? 'Workouts → Bewegungsring' : k === 'steps' ? 'Schritte' : 'Schlaf → Tagebuch'}
              </label>
            ))}
          </div>
          <p className="muted small">
            {health.lastSync ? `Zuletzt abgeglichen ${new Date(health.lastSync).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })} Uhr` : 'Wird beim nächsten Öffnen abgeglichen'}
            {todayValues ? ` · heute ${stepsLabel(todayValues.steps)} Schritte` : ''}
          </p>
          <p className="muted small">Was Daywerk lesen darf, legst du in der Health-App fest (Teilen → Apps → Daywerk). Daywerk schreibt nichts in Health.</p>
          <button type="button" onClick={() => updateSettings({ health: { ...health, enabled: false } })}>Trennen</button>
        </>
      ) : (
        <>
          <p className="muted small">Workouts füllen automatisch den Bewegungsring, Schritte erscheinen bei den Gewohnheiten und die Schlafzeit landet im Stimmungstagebuch.</p>
          <button type="button" className="primary" onClick={() => void connect()} disabled={state === 'unavailable'}>Mit Apple Health verbinden</button>
          {state === 'unavailable' && <p className="muted small">Health ist auf diesem Gerät nicht verfügbar (z. B. iPad) oder die App-Version ist zu alt.</p>}
        </>
      )}
    </div>
  );
}

/** Orte für Erinnerungen beim Ankommen */
export function PlacesPanel() {
  const { data, updateSettings } = useStore();
  const { show } = useToast();
  const places = data.settings.places ?? [];
  const [name, setName] = useState('');
  const [address, setAddress] = useState('');
  const [kind, setKind] = useState<Place['kind']>('einkauf');
  const [busy, setBusy] = useState(false);
  if (!isNativeApp()) return onlyApp;

  const save = (lat: number, lon: number, fallback: string) => {
    const place: Place = { id: newId(), name: name.trim() || fallback || PLACE_KINDS.find((k) => k.id === kind)!.label.slice(3), lat, lon, radius: 150, kind };
    updateSettings({ places: [...places, place] });
    setName('');
    setAddress('');
    show(`„${place.name}“ gespeichert`);
  };

  const add = async (here: boolean) => {
    const { state } = await extras((p) => p.locationStatus({ ask: true }), { state: 'unavailable' as NativePermission });
    if (state !== 'granted') return show('Daywerk darf deinen Standort nicht nutzen – in den iPhone-Einstellungen unter Daywerk → Standort erlauben.', undefined, 8000);
    setBusy(true);
    try {
      if (here) {
        const pos = await extras((p) => p.currentLocation(), null);
        if (!pos) return show('Der Standort ließ sich gerade nicht bestimmen.');
        save(pos.lat, pos.lon, '');
      } else {
        const hit = await extras((p) => p.geocode({ address: address.trim() }), null);
        if (!hit) return show('Diese Adresse habe ich nicht gefunden.');
        save(hit.lat, hit.lon, hit.name);
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="iphone-stack">
      {places.length > 0 && (
        <ul className="ios-list">
          {places.map((p) => (
            <li key={p.id}>
              <span aria-hidden>{PLACE_KINDS.find((k) => k.id === p.kind)?.label.slice(0, 2)}</span>
              <span className="grow">{p.name}<span className="muted small"> · {PLACE_KINDS.find((k) => k.id === p.kind)?.hint}</span></span>
              <select aria-label="Umkreis" value={p.radius} onChange={(e) => updateSettings({ places: places.map((x) => (x.id === p.id ? { ...x, radius: Number(e.target.value) } : x)) })}>
                {[100, 150, 250, 500].map((r) => <option key={r} value={r}>{r} m</option>)}
              </select>
              <button type="button" className="icon" aria-label={`${p.name} entfernen`} onClick={() => updateSettings({ places: places.filter((x) => x.id !== p.id) })}>✕</button>
            </li>
          ))}
        </ul>
      )}
      {places.length < MAX_PLACES && (
        <div className="form-grid">
          <label>Art
            <select value={kind} onChange={(e) => setKind(e.target.value as Place['kind'])}>
              {PLACE_KINDS.map((k) => <option key={k.id} value={k.id}>{k.label}</option>)}
            </select>
          </label>
          <label>Name<input value={name} placeholder="z. B. Rewe Hauptstraße" onChange={(e) => setName(e.target.value)} /></label>
          <label className="full">Adresse<input value={address} placeholder="Straße, Ort" onChange={(e) => setAddress(e.target.value)} /></label>
          <div className="row wrap full">
            <button type="button" className="primary" disabled={busy || !address.trim()} onClick={() => void add(false)}>Adresse speichern</button>
            <button type="button" disabled={busy} onClick={() => void add(true)}>Aktuellen Ort nehmen</button>
          </div>
        </div>
      )}
      <p className="muted small">{PLACE_KINDS.find((k) => k.id === kind)?.hint}. Aufgaben ordnest du in der Aufgabe unter „Ort“ zu. Der Standort bleibt auf dem iPhone – das System meldet nur das Ankommen.</p>
    </div>
  );
}

/** Was Siri und die Aktionstaste können */
export function SiriPanel() {
  if (!isNativeApp()) return onlyApp;
  return (
    <div className="iphone-stack small">
      <p>Sag zum Beispiel:</p>
      <ul className="siri-phrases">
        <li>„Hey Siri, <b>Daywerk eintragen</b>“ – dann einen Satz wie bei der Assistentin („Zahnarzt Freitag 10 Uhr“, „12 € für Pizza“)</li>
        <li>„Hey Siri, <b>Daywerk Einkaufsliste</b>“ – „Milch und Eier“, ohne die App zu öffnen</li>
        <li>„Hey Siri, <b>Daywerk Fokus starten</b>“</li>
        <li>„Hey Siri, <b>Tag abschließen mit Daywerk</b>“</li>
      </ul>
      <p className="muted">Alles davon findest du auch in der Kurzbefehle-App und kannst es auf die Aktionstaste legen (Einstellungen → Aktionstaste → Kurzbefehl → Daywerk).</p>
    </div>
  );
}
