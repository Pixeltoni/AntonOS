/**
 * Govee-Lampen über die offizielle Govee-Schnittstelle (Developer Platform, „Router API“).
 * Hier steht nur die reine Logik: Antworten lesen und Befehle bauen. Geladen wird in
 * `components/lights.tsx` (App direkt, Browser über die Supabase-Funktion „licht“),
 * im iPhone-Widget schickt `LichtWidget.swift` dieselben Befehle selbst.
 *
 * Schlüssel: in der Govee-Home-App unter Profil › Einstellungen › „API-Schlüssel beantragen“.
 */

export const GOVEE_BASE = 'https://openapi.api.govee.com/router/api/v1';

/** Erlaubte Pfade – dieselben prüft die Supabase-Funktion */
export type GoveePath = 'user/devices' | 'device/state' | 'device/control' | 'device/scenes';
export const GOVEE_PATHS: GoveePath[] = ['user/devices', 'device/state', 'device/control', 'device/scenes'];

export interface Range {
  min: number;
  max: number;
}

export interface LightDevice {
  /** Govee-Gerätekennung (MAC-ähnlich, z. B. „AB:CD:…“) */
  id: string;
  sku: string;
  name: string;
  /** Gerätegruppe aus der Govee-App (gemeinsam geschaltet) */
  group: boolean;
  power: boolean;
  /** Helligkeit, wenn einstellbar */
  brightness: Range | null;
  color: boolean;
  /** Weißton in Kelvin, wenn einstellbar */
  colorTemp: Range | null;
  scenes: boolean;
}

export interface LightState {
  online: boolean | null;
  on: boolean | null;
  brightness: number | null;
  /** #RRGGBB */
  color: string | null;
  colorTemp: number | null;
}

export interface LightScene {
  name: string;
  value: unknown;
}

export type LightCommand =
  | { kind: 'power'; on: boolean }
  | { kind: 'brightness'; value: number }
  | { kind: 'color'; hex: string }
  | { kind: 'colorTemp'; kelvin: number }
  | { kind: 'scene'; value: unknown };

const CAP = 'devices.capabilities.';

type Json = Record<string, unknown>;
const obj = (v: unknown): Json => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Json) : {});
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const str = (v: unknown) => (typeof v === 'string' ? v : typeof v === 'number' ? String(v) : '');

function readRange(params: unknown): Range | null {
  const range = obj(obj(params).range);
  const min = Number(range.min);
  const max = Number(range.max);
  return Number.isFinite(min) && Number.isFinite(max) && max > min ? { min, max } : null;
}

/** Antwort von `GET user/devices` → Lampen (sortiert nach Name) */
export function parseDevices(body: unknown): LightDevice[] {
  const out: LightDevice[] = [];
  const seen = new Set<string>();
  for (const raw of arr(obj(body).data)) {
    const d = obj(raw);
    const id = str(d.device);
    const sku = str(d.sku);
    if (!id || !sku || seen.has(id)) continue;
    seen.add(id);
    const caps = arr(d.capabilities).map(obj);
    const find = (type: string, instance?: string) => caps.find((c) => c.type === CAP + type && (!instance || c.instance === instance));
    const bright = find('range', 'brightness');
    const temp = find('color_setting', 'colorTemperatureK');
    out.push({
      id,
      sku,
      name: str(d.deviceName).trim() || sku,
      group: sku === 'SameModeGroup',
      power: !!find('on_off', 'powerSwitch'),
      brightness: bright ? readRange(bright.parameters) ?? { min: 1, max: 100 } : null,
      color: !!find('color_setting', 'colorRgb'),
      colorTemp: temp ? readRange(temp.parameters) ?? { min: 2000, max: 9000 } : null,
      scenes: !!find('dynamic_scene', 'lightScene'),
    });
  }
  return out.sort((a, b) => a.name.localeCompare(b.name, 'de'));
}

/** Antwort von `POST device/state` → Zustand */
export function parseState(body: unknown): LightState {
  const state: LightState = { online: null, on: null, brightness: null, color: null, colorTemp: null };
  for (const raw of arr(obj(obj(body).payload).capabilities)) {
    const c = obj(raw);
    const value = obj(c.state).value;
    const n = Number(value);
    if (c.instance === 'online') state.online = value === true || value === 1 || value === 'true';
    else if (c.instance === 'powerSwitch' && Number.isFinite(n)) state.on = n === 1;
    else if (c.instance === 'brightness' && Number.isFinite(n) && value !== '') state.brightness = n;
    else if (c.instance === 'colorRgb' && Number.isFinite(n) && value !== '') state.color = rgbIntToHex(n);
    else if (c.instance === 'colorTemperatureK' && Number.isFinite(n) && n > 0) state.colorTemp = n;
  }
  return state;
}

/** Antwort von `POST device/scenes` → Szenen */
export function parseScenes(body: unknown): LightScene[] {
  const out: LightScene[] = [];
  for (const raw of arr(obj(obj(body).payload).capabilities)) {
    const c = obj(raw);
    if (c.instance !== 'lightScene') continue;
    for (const o of arr(obj(c.parameters).options).map(obj)) {
      const name = str(o.name).trim();
      if (name && o.value !== undefined) out.push({ name, value: o.value });
    }
  }
  return out;
}

export function hexToRgbInt(hex: string): number | null {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  return m ? parseInt(m[1], 16) : null;
}

export function rgbIntToHex(n: number): string {
  return `#${(Math.max(0, Math.min(0xffffff, Math.round(n))) >>> 0).toString(16).padStart(6, '0')}`;
}

const clamp = (v: number, r: Range) => Math.round(Math.max(r.min, Math.min(r.max, v)));

/** Inhalt für `POST device/control`, oder null, wenn die Lampe das nicht kann */
export function controlBody(device: Pick<LightDevice, 'id' | 'sku' | 'brightness' | 'colorTemp' | 'color' | 'scenes' | 'power'>, cmd: LightCommand, requestId: string): Json | null {
  let capability: Json;
  if (cmd.kind === 'power') {
    if (!device.power) return null;
    capability = { type: `${CAP}on_off`, instance: 'powerSwitch', value: cmd.on ? 1 : 0 };
  } else if (cmd.kind === 'brightness') {
    if (!device.brightness) return null;
    capability = { type: `${CAP}range`, instance: 'brightness', value: clamp(cmd.value, device.brightness) };
  } else if (cmd.kind === 'color') {
    const value = hexToRgbInt(cmd.hex);
    if (!device.color || value === null) return null;
    capability = { type: `${CAP}color_setting`, instance: 'colorRgb', value };
  } else if (cmd.kind === 'colorTemp') {
    if (!device.colorTemp) return null;
    capability = { type: `${CAP}color_setting`, instance: 'colorTemperatureK', value: clamp(cmd.kelvin, device.colorTemp) };
  } else {
    if (!device.scenes) return null;
    capability = { type: `${CAP}dynamic_scene`, instance: 'lightScene', value: cmd.value };
  }
  return { requestId, payload: { sku: device.sku, device: device.id, capability } };
}

/** Inhalt für `POST device/state` und `POST device/scenes` */
export function deviceBody(device: Pick<LightDevice, 'id' | 'sku'>, requestId: string): Json {
  return { requestId, payload: { sku: device.sku, device: device.id } };
}

/** Verständliche Meldung zu einer Antwort; null, wenn alles geklappt hat */
export function goveeError(status: number, body: unknown): string | null {
  const code = Number(obj(body).code);
  const effective = status >= 400 ? status : Number.isFinite(code) && code !== 200 ? code : 200;
  if (effective === 200) return null;
  if (effective === 401 || effective === 403) return 'Der Govee-Schlüssel stimmt nicht. Prüf ihn in den Licht-Einstellungen.';
  if (effective === 429) return 'Zu viele Befehle auf einmal – Govee bremst kurz. Gleich noch mal versuchen.';
  if (effective === 404) return 'Govee kennt diese Lampe nicht (mehr). Lade die Liste neu.';
  if (effective >= 500) return 'Govee antwortet gerade nicht. Später noch mal versuchen.';
  const msg = str(obj(body).msg || obj(body).message).trim();
  return msg ? `Govee: ${msg}` : `Govee meldet Fehler ${effective}.`;
}

/** Sieht aus wie ein Govee-Schlüssel? (UUID-artig, ohne Leerzeichen) */
export function validKey(key: string): boolean {
  return /^[\w-]{16,80}$/.test(key.trim());
}

/** Farben zum schnellen Antippen */
export const LIGHT_COLORS: { name: string; hex: string }[] = [
  { name: 'Warmweiß', hex: '#ffb46b' },
  { name: 'Weiß', hex: '#ffffff' },
  { name: 'Rot', hex: '#ff2a1a' },
  { name: 'Orange', hex: '#ff7a00' },
  { name: 'Gelb', hex: '#ffd400' },
  { name: 'Grün', hex: '#1fd15a' },
  { name: 'Türkis', hex: '#00d5c8' },
  { name: 'Blau', hex: '#1f5cff' },
  { name: 'Lila', hex: '#8a2be2' },
  { name: 'Pink', hex: '#ff3fa4' },
];

/** Lampen in der eingestellten Reihenfolge, ausgeblendete zuletzt bzw. weg */
export function orderLights(devices: LightDevice[], order: string[] = [], hidden: string[] = [], keepHidden = false): LightDevice[] {
  const pos = new Map(order.map((id, i) => [id, i]));
  const hide = new Set(hidden);
  return devices
    .filter((d) => keepHidden || !hide.has(d.id))
    .map((d, i) => ({ d, i }))
    .sort((a, b) => (hide.has(a.d.id) ? 1 : 0) - (hide.has(b.d.id) ? 1 : 0) || (pos.get(a.d.id) ?? 1e6 + a.i) - (pos.get(b.d.id) ?? 1e6 + b.i))
    .map(({ d }) => d);
}

/** Was das iPhone-Widget kennt: Lampe plus zuletzt bekannter Zustand (Felder gleich halten mit `LichtGeraet` in LichtWidget.swift) */
export interface WidgetLight {
  id: string;
  sku: string;
  name: string;
  on: boolean;
  /** #RRGGBB, leer = unbekannt */
  color: string;
  brightness: number;
  /** Nur eigene Gruppen: die schaltbaren Lampen darin */
  members?: { id: string; sku: string }[];
}

/** Erst die eigenen Gruppen, dann die einzelnen Lampen */
export function widgetLights(devices: LightDevice[], states: Record<string, LightState>, order: string[] = [], hidden: string[] = [], groups: GroupLike[] = []): WidgetLight[] {
  const out: WidgetLight[] = [];
  for (const g of groups) {
    const members = groupMembers(g, devices).filter((d) => d.power);
    if (!members.length) continue;
    const s = groupState(g, devices, states);
    out.push({ id: groupKey(g.id), sku: 'AntonOSGruppe', name: g.name, on: !!s.on, color: s.color ?? '', brightness: s.brightness ?? 0, members: members.map((d) => ({ id: d.id, sku: d.sku })) });
  }
  for (const d of orderLights(devices, order, hidden)) {
    if (!d.power) continue;
    const s = states[d.id];
    out.push({ id: d.id, sku: d.sku, name: d.name, on: !!s?.on, color: s?.color ?? '', brightness: s?.brightness ?? 0 });
  }
  return out;
}

/* ---------- Eigene Gruppen ---------- */

export interface GroupLike {
  id: string;
  name: string;
  members: string[];
}

/** Kennung einer eigenen Gruppe in Listen und im Widget (Govee-Kennungen enthalten nie „gruppe:“) */
export const groupKey = (id: string) => `gruppe:${id}`;

/** Mitglieder einer Gruppe, die es (noch) gibt */
export function groupMembers(group: GroupLike, devices: LightDevice[]): LightDevice[] {
  const byId = new Map(devices.map((d) => [d.id, d]));
  return group.members.map((id) => byId.get(id)).filter((d): d is LightDevice => !!d);
}

/** Eine Gruppe als „Lampe“: kann, was mindestens eine Lampe darin kann; Weißton nur im gemeinsamen Bereich */
export function groupDevice(group: GroupLike, devices: LightDevice[]): LightDevice {
  const members = groupMembers(group, devices);
  const temps = members.map((d) => d.colorTemp).filter((r): r is Range => !!r);
  const min = Math.max(...temps.map((r) => r.min));
  const max = Math.min(...temps.map((r) => r.max));
  return {
    id: groupKey(group.id),
    sku: 'AntonOSGruppe',
    name: group.name,
    group: true,
    power: members.some((d) => d.power),
    brightness: members.some((d) => d.brightness) ? { min: 1, max: 100 } : null,
    color: members.some((d) => d.color),
    colorTemp: temps.length && max > min ? { min, max } : null,
    scenes: false,
  };
}

/** Zustand einer Gruppe: an, wenn eine Lampe an ist; Helligkeit als Mittel der eingeschalteten; Farbe nur, wenn alle gleich */
export function groupState(group: GroupLike, devices: LightDevice[], states: Record<string, LightState>): LightState {
  const list = groupMembers(group, devices).map((d) => states[d.id]).filter((s): s is LightState => !!s);
  const lit = list.filter((s) => s.on);
  const bright = lit.map((s) => s.brightness).filter((b): b is number => b !== null);
  const colors = new Set(lit.map((s) => s.color));
  const temps = new Set(lit.map((s) => s.colorTemp));
  return {
    online: list.length ? list.some((s) => s.online !== false) : null,
    on: list.some((s) => s.on === true) ? true : list.some((s) => s.on === false) ? false : null,
    brightness: bright.length ? Math.round(bright.reduce((a, b) => a + b, 0) / bright.length) : null,
    color: colors.size === 1 ? [...colors][0] : null,
    colorTemp: temps.size === 1 ? [...temps][0] : null,
  };
}

/** Lampen einer Gruppe, die den Befehl verstehen (Weißton auf den Bereich der jeweiligen Lampe begrenzt) */
export function groupTargets(group: GroupLike, devices: LightDevice[], cmd: LightCommand): LightDevice[] {
  return groupMembers(group, devices).filter((d) =>
    cmd.kind === 'power' ? d.power : cmd.kind === 'brightness' ? !!d.brightness : cmd.kind === 'color' ? d.color : cmd.kind === 'colorTemp' ? !!d.colorTemp : false,
  );
}

/** Neue Gruppe; leere Namen werden „Gruppe“ */
export function makeGroup(name: string, members: string[], id: string): GroupLike {
  return { id, name: name.trim() || 'Gruppe', members: [...new Set(members)] };
}
