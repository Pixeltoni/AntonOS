// Supabase-Funktion „licht“: reicht Befehle von Daywerk im Browser an die Govee-Schnittstelle weiter
// (Govee erlaubt keine Anfragen direkt aus dem Browser). Ziel ist immer openapi.api.govee.com, nur die
// vier Pfade aus src/lib/govee.ts. Der Govee-Schlüssel kommt im Kopf `x-govee-key` und wird nicht gespeichert.
// Die Antwort von Govee kommt unverändert zurück, ihr Status im Kopf `x-govee-status`.
// Neu veröffentlichen: `supabase functions deploy licht --no-verify-jwt`.

const PUBLISHABLE_KEY = 'sb_publishable_l3rkg588KOfoGH_SQMSwfA_waP0u23E';
const ORIGINS = [/^https:\/\/pixeltoni\.github\.io$/, /^http:\/\/localhost(:\d+)?$/, /^http:\/\/127\.0\.0\.1(:\d+)?$/, /^capacitor:\/\/localhost$/];
const BASE = 'https://openapi.api.govee.com/router/api/v1/';
const PATHS: Record<string, 'GET' | 'POST'> = { 'user/devices': 'GET', 'device/state': 'POST', 'device/control': 'POST', 'device/scenes': 'POST' };
const MAX_BYTES = 2_000_000;

function cors(origin: string | null): Record<string, string> {
  const allowed = origin !== null && ORIGINS.some((o) => o.test(origin)) ? origin : 'https://pixeltoni.github.io';
  return {
    'Access-Control-Allow-Origin': allowed,
    'Access-Control-Allow-Headers': 'apikey, content-type, x-client-info, authorization, x-govee-key',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Expose-Headers': 'x-govee-status',
    Vary: 'Origin',
  };
}

function json(body: unknown, status: number, headers: Record<string, string>): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...headers, 'Content-Type': 'application/json; charset=utf-8' } });
}

export async function handler(req: Request): Promise<Response> {
  const headers = cors(req.headers.get('origin'));
  if (req.method === 'OPTIONS') return new Response('ok', { headers });
  if (req.method !== 'POST') return json({ msg: 'Nur POST' }, 405, headers);
  if (req.headers.get('apikey') !== PUBLISHABLE_KEY) return json({ msg: 'Schlüssel fehlt' }, 401, headers);
  const key = (req.headers.get('x-govee-key') ?? '').trim();
  if (!/^[\w-]{16,80}$/.test(key)) return json({ code: 401, msg: 'Govee-Schlüssel fehlt' }, 200, { ...headers, 'x-govee-status': '401' });
  let input: { path?: unknown; body?: unknown };
  try {
    input = await req.json();
  } catch {
    return json({ msg: 'Kein JSON' }, 400, headers);
  }
  const path = typeof input.path === 'string' ? input.path : '';
  const method = PATHS[path];
  if (!method) return json({ msg: 'Unbekannter Pfad' }, 400, headers);
  const payload = method === 'POST' ? JSON.stringify(input.body ?? {}) : undefined;
  if (payload && payload.length > 20_000) return json({ msg: 'Zu groß' }, 413, headers);
  let res: Response;
  try {
    res = await fetch(BASE + path, {
      method,
      redirect: 'error',
      signal: AbortSignal.timeout(12_000),
      headers: { 'Govee-API-Key': key, 'Content-Type': 'application/json' },
      body: payload,
    });
  } catch {
    return json({ code: 502, msg: 'Govee nicht erreichbar' }, 200, { ...headers, 'x-govee-status': '502' });
  }
  const text = (await res.text()).slice(0, MAX_BYTES);
  return new Response(text || 'null', { status: 200, headers: { ...headers, 'Content-Type': 'application/json; charset=utf-8', 'x-govee-status': String(res.status) } });
}

const deno = (globalThis as { Deno?: { serve: (fn: (req: Request) => Promise<Response>) => void } }).Deno;
if (deno) deno.serve(handler);
