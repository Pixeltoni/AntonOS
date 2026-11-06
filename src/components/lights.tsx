import { useCallback, useEffect, useRef, useState } from 'react';
import { CapacitorHttp } from '@capacitor/core';
import { useStore } from '../store';
import { SUPABASE_KEY, SUPABASE_URL } from '../lib/cloud';
import { AntonWidgets, isNativeApp } from '../lib/native';
import {
  controlBody, deviceBody, GOVEE_BASE, goveeError, groupTargets, parseDevices, parseScenes, parseState, widgetLights,
  type GoveePath, type GroupLike, type LightCommand, type LightDevice, type LightScene, type LightState,
} from '../lib/govee';

const CACHE_KEY = 'antonos:licht';

interface Cache {
  devices: LightDevice[];
  states: Record<string, LightState>;
}

function readCache(): Cache {
  try {
    const raw = JSON.parse(localStorage.getItem(CACHE_KEY) || 'null') as Partial<Cache> | null;
    return { devices: Array.isArray(raw?.devices) ? raw!.devices : [], states: raw?.states && typeof raw.states === 'object' ? raw.states : {} };
  } catch {
    return { devices: [], states: {} };
  }
}

function writeCache(c: Cache) {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(c));
  } catch {
    // nur ein Zwischenspeicher
  }
}

const requestId = () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

export class GoveeError extends Error {}

/** Eine Anfrage an Govee: in der iPhone-App direkt, im Browser über die Supabase-Funktion „licht“ (CORS) */
export async function govee(key: string, path: GoveePath, body?: unknown): Promise<unknown> {
  let status: number;
  let data: unknown;
  if (isNativeApp()) {
    try {
      const r = await CapacitorHttp.request({
        url: `${GOVEE_BASE}/${path}`,
        method: body === undefined ? 'GET' : 'POST',
        headers: { 'Govee-API-Key': key.trim(), 'Content-Type': 'application/json' },
        data: body,
        connectTimeout: 8000,
        readTimeout: 12_000,
      });
      status = r.status;
      data = typeof r.data === 'string' ? JSON.parse(r.data || 'null') : r.data;
    } catch {
      throw new GoveeError('Govee ist nicht erreichbar. Bist du online?');
    }
  } else {
    let res: Response;
    try {
      res = await fetch(`${SUPABASE_URL}/functions/v1/licht`, {
        method: 'POST',
        headers: { apikey: SUPABASE_KEY, 'Content-Type': 'application/json', 'x-govee-key': key.trim() },
        body: JSON.stringify({ path, body }),
      });
    } catch {
      throw new GoveeError('Govee ist nicht erreichbar. Bist du online?');
    }
    if (res.status === 404 && !res.headers.get('x-govee-status')) throw new GoveeError('Im Browser ist die Licht-Steuerung noch nicht eingerichtet. In der iPhone-App klappt sie schon.');
    status = Number(res.headers.get('x-govee-status')) || res.status;
    data = await res.json().catch(() => null);
  }
  const error = goveeError(status, data);
  if (error) throw new GoveeError(error);
  return data;
}

/** Legt Schlüssel und Lampen fürs iPhone-Widget ab (nur in der App) */
function pushWidget(key: string, cache: Cache, order?: string[], hidden?: string[], groups?: GroupLike[]) {
  if (!isNativeApp()) return;
  const lights = key ? widgetLights(cache.devices, cache.states, order, hidden, groups) : [];
  void AntonWidgets.setLights({ key: key.trim(), lights: JSON.stringify(lights) }).catch(() => undefined);
}

/** Nur in der App: hält Schlüssel und Lampen fürs Widget aktuell, auch wenn die Licht-Seite nie geöffnet wurde */
export function useLightsWidget() {
  const { data } = useStore();
  const { key = '', order, hidden, groups } = data.settings.lights ?? {};
  const orderKey = JSON.stringify([order, hidden, groups]);
  useEffect(() => {
    if (!isNativeApp()) return;
    const cache = readCache();
    pushWidget(key, cache, order, hidden, groups);
    if (!key || cache.devices.length) return;
    // Noch keine Lampen bekannt: einmal die Liste holen
    void govee(key, 'user/devices')
      .then((body) => {
        const next = { ...cache, devices: parseDevices(body) };
        writeCache(next);
        pushWidget(key, next, order, hidden, groups);
      })
      .catch(() => undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, orderKey]);
}

/** Alles für die Licht-Seite */
export function useLights() {
  const { data } = useStore();
  const settings = data.settings.lights;
  const key = settings?.key ?? '';
  const [cache, setCache] = useState<Cache>(readCache);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const latest = useRef({ key, cache, settings });
  latest.current = { key, cache, settings };

  const save = useCallback((next: Cache) => {
    latest.current.cache = next;
    setCache(next);
    writeCache(next);
    const { key: k, settings: s } = latest.current;
    pushWidget(k, next, s?.order, s?.hidden, s?.groups);
  }, []);

  const setState = useCallback((id: string, patch: Partial<LightState>) => {
    const c = latest.current.cache;
    const prev: LightState = c.states[id] ?? { online: null, on: null, brightness: null, color: null, colorTemp: null };
    save({ ...c, states: { ...c.states, [id]: { ...prev, ...patch } } });
  }, [save]);

  /** Lampenliste und Zustände neu laden */
  const refresh = useCallback(async () => {
    const k = latest.current.key;
    if (!k) return;
    setLoading(true);
    setError(null);
    try {
      const devices = parseDevices(await govee(k, 'user/devices'));
      const states: Record<string, LightState> = { ...latest.current.cache.states };
      // Gruppen haben keinen abfragbaren Zustand
      const ask = devices.filter((d) => d.power && !d.group);
      for (let i = 0; i < ask.length; i += 4) {
        await Promise.all(ask.slice(i, i + 4).map(async (d) => {
          try {
            states[d.id] = parseState(await govee(k, 'device/state', deviceBody(d, requestId())));
          } catch {
            // eine Lampe offline – die anderen trotzdem zeigen
          }
        }));
      }
      save({ devices, states });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Das hat nicht geklappt.');
    } finally {
      setLoading(false);
    }
  }, [save]);

  /** Befehl schicken – die Anzeige springt sofort um und wird bei einem Fehler zurückgesetzt */
  const send = useCallback(async (device: LightDevice, cmd: LightCommand) => {
    const body = controlBody(device, cmd, requestId());
    if (!body) return;
    const before = latest.current.cache.states[device.id];
    if (cmd.kind === 'power') setState(device.id, { on: cmd.on });
    else if (cmd.kind === 'brightness') setState(device.id, { brightness: cmd.value, on: true });
    else if (cmd.kind === 'color') setState(device.id, { color: cmd.hex, colorTemp: null, on: true });
    else if (cmd.kind === 'colorTemp') setState(device.id, { colorTemp: cmd.kelvin, color: null, on: true });
    else setState(device.id, { on: true });
    setError(null);
    try {
      await govee(latest.current.key, 'device/control', body);
    } catch (e) {
      const c = latest.current.cache;
      const states = { ...c.states };
      if (before) states[device.id] = before;
      else delete states[device.id];
      save({ ...c, states });
      setError(e instanceof Error ? e.message : 'Das hat nicht geklappt.');
    }
  }, [save, setState]);

  /** Alle (sichtbaren) Lampen an oder aus */
  const sendAll = useCallback(async (devices: LightDevice[], on: boolean) => {
    for (const d of devices) {
      if (d.power) await send(d, { kind: 'power', on });
    }
  }, [send]);

  /** Befehl an alle Lampen einer eigenen Gruppe, die ihn verstehen (je vier gleichzeitig) */
  const sendGroup = useCallback(async (group: GroupLike, cmd: LightCommand) => {
    const targets = groupTargets(group, latest.current.cache.devices, cmd);
    for (let i = 0; i < targets.length; i += 4) await Promise.all(targets.slice(i, i + 4).map((d) => send(d, cmd)));
  }, [send]);

  const loadScenes = useCallback(async (device: LightDevice): Promise<LightScene[]> => {
    try {
      return parseScenes(await govee(latest.current.key, 'device/scenes', deviceBody(device, requestId())));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Szenen ließen sich nicht laden.');
      return [];
    }
  }, []);

  // Beim Öffnen (und nach neuem Schlüssel) frisch laden
  useEffect(() => {
    if (key) void refresh();
    else save({ devices: [], states: {} });
  }, [key, refresh, save]);

  return { key, settings, devices: cache.devices, states: cache.states, loading, error, refresh, send, sendAll, sendGroup, loadScenes };
}
