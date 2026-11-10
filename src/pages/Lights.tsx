import { useEffect, useRef, useState } from 'react';
import { ChevronDown, ChevronUp, Eye, EyeOff, Lightbulb, LightbulbOff, Pencil, Plus, RefreshCw, Trash2 } from 'lucide-react';
import { Empty, PageHeader, Panel } from '../components/ui';
import { useLights } from '../components/lights';
import { newId, useStore } from '../store';
import { groupDevice, groupMembers, groupState, LIGHT_COLORS, makeGroup, orderLights, validKey, type LightCommand, type LightDevice, type LightScene, type LightState } from '../lib/govee';
import { moveItem } from '../lib/layout';
import { isNativeApp } from '../lib/native';
import type { LightGroup, LightSettings } from '../types';

/** Govee-Lampen schalten – dieselben wie in der Govee-App, auch als Widget */
export function Lights() {
  const { data, updateSettings } = useStore();
  const lights = useLights();
  const settings: LightSettings = data.settings.lights ?? { key: '' };
  const [editing, setEditing] = useState(false);
  const set = (patch: Partial<LightSettings>) => updateSettings({ lights: { ...settings, ...patch } });

  if (!lights.key) return (<><PageHeader title="Licht" subtitle="Deine Govee-Lampen in Daywerk und als Widget" /><KeySetup onSave={(key) => set({ key })} /></>);

  const visible = orderLights(lights.devices, settings.order, settings.hidden);
  const all = orderLights(lights.devices, settings.order, settings.hidden, true);
  const groups = settings.groups ?? [];
  const noScenes = async () => [] as LightScene[];

  const move = (id: string, dir: -1 | 1) => {
    const ids = all.map((d) => d.id);
    const from = ids.indexOf(id);
    set({ order: moveItem(ids, from, dir) });
  };
  const toggleHidden = (id: string) => {
    const hidden = new Set(settings.hidden ?? []);
    if (hidden.has(id)) hidden.delete(id);
    else hidden.add(id);
    set({ hidden: [...hidden] });
  };

  return (
    <>
      <PageHeader
        title="Licht"
        subtitle={isNativeApp() ? 'Auch als Widget und im Kontrollzentrum' : 'Deine Govee-Lampen'}
        actions={
          <button type="button" onClick={() => void lights.refresh()} disabled={lights.loading} aria-label="Neu laden">
            <RefreshCw size={16} className={lights.loading ? 'spin' : undefined} /> {lights.loading ? 'Lädt …' : 'Neu laden'}
          </button>
        }
      />
      {lights.error && <p className="small danger" role="alert">{lights.error}</p>}
      {visible.length > 0 && (
        <div className="light-all row">
          <button type="button" className="primary grow" onClick={() => void lights.sendAll(visible, true)}><Lightbulb size={16} /> Alle an</button>
          <button type="button" className="grow" onClick={() => void lights.sendAll(visible, false)}><LightbulbOff size={16} /> Alle aus</button>
        </div>
      )}
      {lights.devices.length === 0 ? (
        <Panel><Empty>{lights.loading ? 'Lampen werden geladen …' : 'Keine Lampen gefunden. Sind sie in der Govee-App eingerichtet?'}</Empty></Panel>
      ) : (
        <>
          {groups.length > 0 && (
            <>
              <h2 className="light-section">Gruppen</h2>
              <div className="light-grid">
                {groups.map((g) => {
                  const n = groupMembers(g, lights.devices).length;
                  return (
                    <LightCard
                      key={g.id}
                      device={groupDevice(g, lights.devices)}
                      state={groupState(g, lights.devices, lights.states)}
                      send={(_, cmd) => lights.sendGroup(g, cmd)}
                      loadScenes={noScenes}
                      note={n === 1 ? '1 Lampe' : `${n} Lampen`}
                    />
                  );
                })}
              </div>
              <h2 className="light-section">Einzelne Lampen</h2>
            </>
          )}
          <div className="light-grid">
            {visible.map((d) => <LightCard key={d.id} device={d} state={lights.states[d.id]} send={lights.send} loadScenes={lights.loadScenes} />)}
          </div>
        </>
      )}
      {lights.devices.length > 0 && <GroupsPanel groups={groups} devices={all} onChange={(next) => set({ groups: next })} />}
      <Panel title="Einstellungen" actions={<button type="button" onClick={() => setEditing((e) => !e)}>{editing ? 'Fertig' : 'Bearbeiten'}</button>}>
        {editing ? (
          <>
            <p className="small muted">Reihenfolge gilt auch fürs Widget. Ausgeblendete Lampen erscheinen weder hier noch im Widget.</p>
            <ul className="list">
              {all.map((d, i) => {
                const hidden = settings.hidden?.includes(d.id);
                return (
                  <li key={d.id} className={hidden ? 'muted' : undefined}>
                    <span className="grow">{d.name}{d.group ? ' · Gruppe' : ''}</span>
                    <button type="button" className="icon" onClick={() => move(d.id, -1)} disabled={i === 0} aria-label="Nach oben"><ChevronUp size={18} /></button>
                    <button type="button" className="icon" onClick={() => move(d.id, 1)} disabled={i === all.length - 1} aria-label="Nach unten"><ChevronDown size={18} /></button>
                    <button type="button" className="icon" onClick={() => toggleHidden(d.id)} aria-label={hidden ? 'Einblenden' : 'Ausblenden'}>{hidden ? <EyeOff size={18} /> : <Eye size={18} />}</button>
                  </li>
                );
              })}
            </ul>
            <button type="button" className="danger" onClick={() => { if (confirm('Govee-Schlüssel entfernen? Die Lampen verschwinden dann aus Daywerk und dem Widget.')) set({ key: '' }); }}>Govee-Schlüssel entfernen</button>
          </>
        ) : (
          <p className="small muted">
            {lights.devices.length} {lights.devices.length === 1 ? 'Lampe' : 'Lampen'} aus deinem Govee-Konto
            {settings.hidden?.length ? `, ${settings.hidden.length} ausgeblendet` : ''}.
            {isNativeApp() ? ' Widget „Licht“ auf dem Homescreen hinzufügen, um ohne App zu schalten.' : ''}
          </p>
        )}
      </Panel>
    </>
  );
}

function KeySetup({ onSave }: { onSave: (key: string) => void }) {
  const [key, setKey] = useState('');
  const ok = validKey(key);
  return (
    <Panel title="Govee verbinden" icon={Lightbulb}>
      <ol className="light-steps">
        <li>Öffne die <strong>Govee-Home-App</strong> und tippe unten auf <strong>Profil</strong>.</li>
        <li>Oben rechts auf das Zahnrad › <strong>API-Schlüssel beantragen</strong> (bzw. „Apply for API Key“).</li>
        <li>Govee schickt dir den Schlüssel per Mail – hier einfügen.</li>
      </ol>
      <form className="row" onSubmit={(e) => { e.preventDefault(); if (ok) onSave(key.trim()); }}>
        <input className="grow" type="text" autoComplete="off" autoCapitalize="off" spellCheck={false} value={key} onChange={(e) => setKey(e.target.value)} placeholder="z. B. 1a2b3c4d-…" aria-label="Govee-API-Schlüssel" />
        <button type="submit" className="primary" disabled={!ok}>Verbinden</button>
      </form>
      <p className="small muted">Der Schlüssel bleibt in deinen Daywerk-Daten (und wird mit deinem Konto synchronisiert, damit es am PC und am iPhone klappt).</p>
    </Panel>
  );
}

/** Wert eines Reglers erst nach kurzer Pause schicken, damit Govee nicht bremst */
function useDebounced(send: (v: number) => void, ms = 350) {
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);
  return (v: number) => {
    clearTimeout(timer.current);
    timer.current = setTimeout(() => send(v), ms);
  };
}

function LightCard({ device, state, send, loadScenes, note }: {
  device: LightDevice;
  state?: LightState;
  send: (d: LightDevice, cmd: LightCommand) => Promise<void>;
  loadScenes: (d: LightDevice) => Promise<LightScene[]>;
  /** Eigene Gruppe: z. B. „3 Lampen“ */
  note?: string;
}) {
  const on = !!state?.on;
  const [open, setOpen] = useState(false);
  const [bright, setBright] = useState(state?.brightness ?? 100);
  const [temp, setTemp] = useState(state?.colorTemp ?? 3000);
  const [scenes, setScenes] = useState<LightScene[] | null>(null);
  const sendBright = useDebounced((v) => void send(device, { kind: 'brightness', value: v }));
  const sendTemp = useDebounced((v) => void send(device, { kind: 'colorTemp', kelvin: v }));

  useEffect(() => { if (state?.brightness != null) setBright(state.brightness); }, [state?.brightness]);
  useEffect(() => { if (state?.colorTemp != null) setTemp(state.colorTemp); }, [state?.colorTemp]);
  useEffect(() => {
    if (open && device.scenes && scenes === null) void loadScenes(device).then(setScenes);
  }, [open, device, scenes, loadScenes]);

  const color = state?.color ?? (state?.colorTemp ? '#ffd9a8' : '#ffcf70');
  const more = device.color || device.colorTemp || device.scenes;
  const offline = state?.online === false;

  return (
    <div className={`panel light-card${on ? ' on' : ''}`} style={{ ['--light' as string]: color }}>
      <div className="row">
        <span className="light-bulb" aria-hidden><Lightbulb size={20} /></span>
        <div className="grow light-name">
          <strong>{device.name}</strong>
          <span className="small muted">{note ? `${note} · ` : ''}{offline ? 'offline' : device.group && !note ? 'Gruppe' : on ? (state?.brightness != null && device.brightness ? `an · ${state.brightness} %` : 'an') : state?.on === false ? 'aus' : '–'}</span>
        </div>
        {device.power && (
          <input type="checkbox" className="switch" checked={on} onChange={(e) => void send(device, { kind: 'power', on: e.target.checked })} aria-label={`${device.name} ${on ? 'ausschalten' : 'einschalten'}`} />
        )}
      </div>
      {device.brightness && (
        <input
          type="range"
          className="light-range"
          min={device.brightness.min}
          max={device.brightness.max}
          value={bright}
          onChange={(e) => { const v = Number(e.target.value); setBright(v); sendBright(v); }}
          aria-label={`Helligkeit ${device.name}`}
        />
      )}
      {more && (
        <button type="button" className="light-more" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
          {open ? 'Weniger' : device.scenes ? 'Farbe & Szenen' : 'Farbe'} {open ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
        </button>
      )}
      {open && (
        <div className="light-extra">
          {device.color && (
            <div className="light-colors">
              {LIGHT_COLORS.map((c) => (
                <button key={c.hex} type="button" style={{ background: c.hex }} className={state?.color === c.hex ? 'active' : undefined} onClick={() => void send(device, { kind: 'color', hex: c.hex })} aria-label={c.name} title={c.name} />
              ))}
              <label className="light-picker" title="Eigene Farbe">
                <input type="color" value={state?.color ?? '#ffffff'} onChange={(e) => void send(device, { kind: 'color', hex: e.target.value })} aria-label="Eigene Farbe" />
              </label>
            </div>
          )}
          {device.colorTemp && (
            <label className="light-temp">
              <span className="small muted">Weißton {temp} K</span>
              <input type="range" className="light-range temp" min={device.colorTemp.min} max={device.colorTemp.max} step={100} value={temp} onChange={(e) => { const v = Number(e.target.value); setTemp(v); sendTemp(v); }} />
            </label>
          )}
          {device.scenes && (
            <div className="light-scenes">
              {scenes === null ? <span className="small muted">Szenen laden …</span> : scenes.length === 0 ? <span className="small muted">Keine Szenen</span> : scenes.map((s) => (
                <button key={s.name} type="button" onClick={() => void send(device, { kind: 'scene', value: s.value })}>{s.name}</button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/** Eigene Gruppen anlegen, ändern und löschen */
function GroupsPanel({ groups, devices, onChange }: { groups: LightGroup[]; devices: LightDevice[]; onChange: (groups: LightGroup[]) => void }) {
  const [edit, setEdit] = useState<LightGroup | null>(null);
  const save = (g: LightGroup) => {
    onChange(groups.some((x) => x.id === g.id) ? groups.map((x) => (x.id === g.id ? g : x)) : [...groups, g]);
    setEdit(null);
  };
  const names = (g: LightGroup) => groupMembers(g, devices).map((d) => d.name).join(', ') || 'keine Lampen';
  return (
    <Panel title="Gruppen" actions={!edit && <button type="button" onClick={() => setEdit({ id: newId(), name: '', members: [] })}><Plus size={16} /> Neue Gruppe</button>}>
      {edit ? (
        <GroupEditor group={edit} devices={devices} onSave={save} onCancel={() => setEdit(null)} isNew={!groups.some((g) => g.id === edit.id)} />
      ) : groups.length === 0 ? (
        <p className="small muted">Fasse Lampen zu Gruppen zusammen, z. B. „Wohnzimmer“ – dann schaltest, dimmst und färbst du sie gemeinsam, auch im Widget.</p>
      ) : (
        <ul className="list">
          {groups.map((g, i) => (
            <li key={g.id}>
              <div className="grow light-name">
                <strong>{g.name}</strong>
                <span className="small muted">{names(g)}</span>
              </div>
              <button type="button" className="icon" onClick={() => onChange(moveItem(groups, i, -1))} disabled={i === 0} aria-label="Nach oben"><ChevronUp size={18} /></button>
              <button type="button" className="icon" onClick={() => setEdit(g)} aria-label={`${g.name} bearbeiten`}><Pencil size={16} /></button>
              <button type="button" className="icon" onClick={() => { if (confirm(`Gruppe „${g.name}“ löschen? Die Lampen bleiben.`)) onChange(groups.filter((x) => x.id !== g.id)); }} aria-label={`${g.name} löschen`}><Trash2 size={16} /></button>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}

function GroupEditor({ group, devices, onSave, onCancel, isNew }: { group: LightGroup; devices: LightDevice[]; onSave: (g: LightGroup) => void; onCancel: () => void; isNew: boolean }) {
  const [name, setName] = useState(group.name);
  const [members, setMembers] = useState<string[]>(group.members);
  const toggle = (id: string) => setMembers((m) => (m.includes(id) ? m.filter((x) => x !== id) : [...m, id]));
  // Govee-eigene Gruppen nicht verschachteln
  const lamps = devices.filter((d) => d.power && !d.group);
  return (
    <form className="light-group-edit" onSubmit={(e) => { e.preventDefault(); if (members.length) onSave({ ...makeGroup(name, members, group.id) }); }}>
      <input type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="Name, z. B. Wohnzimmer" aria-label="Name der Gruppe" autoFocus={isNew} />
      <ul className="list">
        {lamps.map((d) => (
          <li key={d.id}>
            <label className="row grow">
              <input type="checkbox" checked={members.includes(d.id)} onChange={() => toggle(d.id)} />
              <span className="grow">{d.name}</span>
            </label>
          </li>
        ))}
      </ul>
      <div className="row end">
        <button type="button" onClick={onCancel}>Abbrechen</button>
        <button type="submit" className="primary" disabled={!members.length}>{isNew ? 'Gruppe anlegen' : 'Speichern'}</button>
      </div>
    </form>
  );
}
