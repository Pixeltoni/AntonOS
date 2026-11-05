// Supabase-Funktion „rezept“: lädt eine Rezeptseite für AntonOS im Browser (dort verhindert CORS das direkte Laden).
// Zurück kommen nur die Bausteine für den Import – JSON-LD, ein paar Meta-Angaben und der Titel –,
// nie die ganze Seite. Gelesen wird das Rezept dann in der App (src/lib/recipeimport.ts).
// Neu veröffentlichen: über das Supabase-Dashboard oder `supabase functions deploy rezept --no-verify-jwt`.

const PUBLISHABLE_KEY = 'sb_publishable_l3rkg588KOfoGH_SQMSwfA_waP0u23E';
const ORIGINS = [/^https:\/\/pixeltoni\.github\.io$/, /^http:\/\/localhost(:\d+)?$/, /^http:\/\/127\.0\.0\.1(:\d+)?$/, /^capacitor:\/\/localhost$/];
const MAX_BYTES = 3_000_000;
const MAX_JSONLD = 400_000;
const META = /^(og:title|og:image|og:image:url|og:image:secure_url|og:url|og:description|description|twitter:image|twitter:title)$/;

function cors(origin: string | null): Record<string, string> {
  const allowed = origin !== null && ORIGINS.some((o) => o.test(origin)) ? origin : 'https://pixeltoni.github.io';
  return {
    'Access-Control-Allow-Origin': allowed,
    'Access-Control-Allow-Headers': 'apikey, content-type, x-client-info, authorization',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    Vary: 'Origin',
  };
}

function json(body: unknown, status: number, headers: Record<string, string>): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...headers, 'Content-Type': 'application/json; charset=utf-8' } });
}

/** Keine Adressen im eigenen Netz und keine nackten IP-Adressen */
function allowedUrl(raw: unknown): URL | null {
  if (typeof raw !== 'string' || raw.length > 2000) return null;
  try {
    const u = new URL(raw);
    if (u.protocol !== 'https:' && u.protocol !== 'http:') return null;
    // Punkte am Ende („localhost.“) zählen nicht
    const host = u.hostname.toLowerCase().replace(/\.+$/, '');
    if (!host.includes('.') || u.username || u.password) return null;
    if (/(^|\.)(localhost|local|internal|lan|home|arpa|intranet|corp)$/.test(host)) return null;
    if (/^[\d.]+$/.test(host) || /^0x/i.test(host) || host.includes(':') || host.startsWith('[')) return null;
    if (u.port && u.port !== '80' && u.port !== '443') return null;
    return u;
  } catch {
    return null;
  }
}

/** Private, Loopback- und Link-Local-Adressen (IPv4 und IPv6) */
export function privateIp(ip: string): boolean {
  const v4 = ip.match(/^(?:::ffff:)?(\d+)\.(\d+)\.(\d+)\.(\d+)$/i);
  if (v4) {
    const [a, b] = [Number(v4[1]), Number(v4[2])];
    return a === 0 || a === 10 || a === 127 || (a === 100 && b >= 64 && b <= 127) || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || a >= 224;
  }
  const v6 = ip.toLowerCase();
  return v6 === '::' || v6 === '::1' || /^f[cd]/.test(v6) || /^fe[89ab]/.test(v6);
}

type Resolver = (host: string, type: 'A' | 'AAAA') => Promise<string[]>;
const denoDns = (globalThis as { Deno?: { resolveDns?: Resolver } }).Deno;
const resolveDns: Resolver | undefined = denoDns?.resolveDns ? (host, type) => denoDns.resolveDns!(host, type) : undefined;

/** Zeigt der Name auf eine Adresse im eigenen Netz? (nur wo Deno DNS-Abfragen erlaubt) */
async function pointsInside(host: string): Promise<boolean> {
  if (!resolveDns) return false;
  const found = (await Promise.all((['A', 'AAAA'] as const).map((t) => resolveDns(host, t).catch(() => [] as string[])))).flat();
  return found.some(privateIp);
}

const attr = (tag: string, name: string) => {
  const m = tag.match(new RegExp(`\\b${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`, 'i'));
  return m ? (m[1] ?? m[2] ?? m[3] ?? '') : '';
};

function pageData(html: string) {
  const jsonld: string[] = [];
  let size = 0;
  for (const m of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)) {
    if (!/application\/ld\+json/i.test(attr(m[1], 'type'))) continue;
    const body = m[2].trim();
    if (!body || size + body.length > MAX_JSONLD) continue;
    size += body.length;
    jsonld.push(body);
  }
  const meta: Record<string, string> = {};
  for (const m of html.matchAll(/<meta\b[^>]*>/gi)) {
    const key = (attr(m[0], 'property') || attr(m[0], 'name')).toLowerCase();
    const content = attr(m[0], 'content');
    if (key && content && META.test(key) && !meta[key]) meta[key] = content.slice(0, 2000);
  }
  const title = (html.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i)?.[1] ?? '').replace(/\s+/g, ' ').trim().slice(0, 300);
  return { jsonld, meta, title };
}

/** Liest höchstens MAX_BYTES der Antwort */
async function readLimited(res: Response): Promise<string> {
  const reader = res.body?.getReader();
  if (!reader) return '';
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (total < MAX_BYTES) {
    const { done, value } = await reader.read();
    if (done || !value) break;
    chunks.push(value);
    total += value.length;
  }
  await reader.cancel().catch(() => undefined);
  const all = new Uint8Array(Math.min(total, MAX_BYTES));
  let at = 0;
  for (const c of chunks) {
    const part = c.subarray(0, Math.max(0, all.length - at));
    all.set(part, at);
    at += part.length;
  }
  const type = res.headers.get('content-type') ?? '';
  const charset = type.match(/charset=([\w-]+)/i)?.[1] ?? 'utf-8';
  try {
    return new TextDecoder(charset).decode(all);
  } catch {
    return new TextDecoder().decode(all);
  }
}

export async function handler(req: Request): Promise<Response> {
  const headers = cors(req.headers.get('origin'));
  if (req.method === 'OPTIONS') return new Response('ok', { headers });
  if (req.method !== 'POST') return json({ error: 'Nur POST' }, 405, headers);
  if (req.headers.get('apikey') !== PUBLISHABLE_KEY) return json({ error: 'Schlüssel fehlt' }, 401, headers);
  let body: { url?: unknown };
  try {
    body = await req.json();
  } catch {
    return json({ error: 'Kein JSON' }, 400, headers);
  }
  const url = allowedUrl(body.url);
  if (!url) return json({ error: 'Ungültige Adresse' }, 400, headers);
  // Weiterleitungen selbst folgen, damit jedes Ziel dieselbe Prüfung durchläuft
  const signal = AbortSignal.timeout(10_000);
  let current = url;
  let res: Response | null = null;
  for (let hop = 0; hop <= 5; hop++) {
    if (await pointsInside(current.hostname)) return json({ error: 'Ungültige Adresse' }, 400, headers);
    try {
      res = await fetch(current, {
        redirect: 'manual',
        signal,
        headers: {
          'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1',
          Accept: 'text/html,application/xhtml+xml;q=0.9,*/*;q=0.5',
          'Accept-Language': 'de-DE,de;q=0.9,en;q=0.6',
        },
      });
    } catch {
      return json({ error: 'Seite nicht erreichbar' }, 502, headers);
    }
    if (res.status < 300 || res.status >= 400) break;
    const location = res.headers.get('location');
    await res.body?.cancel().catch(() => undefined);
    let next: URL | null = null;
    try {
      next = location ? allowedUrl(new URL(location, current).href) : null;
    } catch {
      next = null;
    }
    if (!next || hop === 5) return json({ error: 'Ungültige Weiterleitung' }, 502, headers);
    current = next;
    res = null;
  }
  if (!res) return json({ error: 'Seite nicht erreichbar' }, 502, headers);
  if (!res.ok) return json({ error: `Seite antwortet mit ${res.status}`, status: res.status }, 502, headers);
  const html = await readLimited(res);
  return json({ url: current.href, ...pageData(html) }, 200, { ...headers, 'Cache-Control': 'public, max-age=3600' });
}

// In Supabase läuft die Funktion unter Deno; beim Testen mit Node gibt es kein Deno
const deno = (globalThis as { Deno?: { serve: (fn: (req: Request) => Promise<Response>) => void } }).Deno;
if (deno) deno.serve(handler);
