import type { Recipe } from '../types';

/**
 * Rezept-Import per Link: Fast jede Rezeptseite (Chefkoch, Food-Blogs mit WordPress …) liefert ihr Rezept
 * maschinenlesbar als JSON-LD nach schema.org/Recipe mit. Hier wird es aus der Seite gelesen und in ein
 * Daywerk-Rezept übersetzt. Die Seite lädt in der iPhone-App das Gerät selbst, im Browser die
 * Supabase-Funktion `rezept` (supabase/functions/rezept) – sie schickt nur diese Bausteine zurück.
 */

/** Was von einer Seite gebraucht wird */
export interface PageData {
  /** Inhalt aller <script type="application/ld+json">-Blöcke */
  jsonld: string[];
  /** og:title, og:image, description … */
  meta: Record<string, string>;
  /** <title> der Seite */
  title: string;
}

export type RecipeDraft = Omit<Recipe, 'id'>;

export interface ImportResult {
  recipe: RecipeDraft;
  /** false = keine Rezeptdaten, nur Titel und Foto der Seite */
  complete: boolean;
}

/** Höchstens so viel Text aus JSON-LD wird übernommen */
const MAX_JSONLD = 400_000;

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', frac12: '½', frac14: '¼', frac34: '¾', deg: '°', auml: 'ä', ouml: 'ö', uuml: 'ü', Auml: 'Ä', Ouml: 'Ö', Uuml: 'Ü', szlig: 'ß', eacute: 'é', egrave: 'è', ndash: '–', mdash: '—', hellip: '…', rsquo: '’', lsquo: '‘', rdquo: '”', ldquo: '“', bdquo: '„', times: '×' };

/** HTML-Entitäten wie &amp; oder &#8211; in Zeichen übersetzen */
export function decodeEntities(s: string): string {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z0-9]+);/gi, (all, code: string) => {
    if (code[0] === '#') {
      const n = code[1].toLowerCase() === 'x' ? parseInt(code.slice(2), 16) : parseInt(code.slice(1), 10);
      return Number.isFinite(n) && n > 0 && n < 0x110000 ? String.fromCodePoint(n) : all;
    }
    return ENTITIES[code] ?? ENTITIES[code.toLowerCase()] ?? all;
  });
}

/** Text ohne HTML-Tags, Entitäten aufgelöst, Leerraum zusammengefasst */
export function cleanText(s: unknown): string {
  if (typeof s !== 'string') return typeof s === 'number' ? String(s) : '';
  return decodeEntities(decodeEntities(s.replace(/<br\s*\/?>/gi, ' ').replace(/<[^>]*>/g, ' ')))
    .replace(/[ \s]+/g, ' ')
    .trim();
}

const attr = (tag: string, name: string) => {
  const m = tag.match(new RegExp(`\\b${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`, 'i'));
  return m ? (m[1] ?? m[2] ?? m[3] ?? '') : '';
};

/** Holt JSON-LD-Blöcke, Meta-Angaben und Titel aus dem HTML einer Seite */
export function pageData(html: string): PageData {
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
    if (key && content && /^(og:title|og:image|og:image:url|og:image:secure_url|og:url|og:description|description|twitter:image|twitter:title)$/.test(key) && !meta[key]) meta[key] = decodeEntities(content).trim();
  }
  const title = cleanText(html.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i)?.[1] ?? '');
  return { jsonld, meta, title };
}

type Json = unknown;
type Obj = Record<string, Json>;
const isObj = (v: Json): v is Obj => !!v && typeof v === 'object' && !Array.isArray(v);
const asList = (v: Json): Json[] => (Array.isArray(v) ? v : v === undefined || v === null ? [] : [v]);

/** JSON-LD tolerant lesen: manche Seiten haben Zeilenumbrüche oder Steuerzeichen in Zeichenketten */
function parseJson(text: string): Json {
  const raw = text.replace(/^\s*<!--/, '').replace(/-->\s*$/, '').replace(/^\s*\/\/\s*<!\[CDATA\[/, '').replace(/\/\/\s*\]\]>\s*$/, '');
  try {
    return JSON.parse(raw);
  } catch {
    try {
      // eslint-disable-next-line no-control-regex
      return JSON.parse(raw.replace(/[\u0000-\u001f]+/g, ' '));
    } catch {
      return null;
    }
  }
}

const hasType = (o: Obj, type: string) => asList(o['@type']).some((t) => typeof t === 'string' && t.replace(/^.*[/:]/, '').toLowerCase() === type.toLowerCase());

/** Sucht das erste Rezept in den JSON-LD-Daten – auch in @graph, Listen und mainEntity */
export function findRecipe(blocks: string[]): Obj | null {
  const seen = new Set<Json>();
  const walk = (v: Json, depth: number): Obj | null => {
    if (depth > 8 || !v || typeof v !== 'object' || seen.has(v)) return null;
    seen.add(v);
    if (Array.isArray(v)) {
      for (const x of v) {
        const hit = walk(x, depth + 1);
        if (hit) return hit;
      }
      return null;
    }
    const o = v as Obj;
    if (hasType(o, 'Recipe')) return o;
    for (const key of ['@graph', 'mainEntity', 'mainEntityOfPage', 'itemListElement', 'item', 'about']) {
      const hit = walk(o[key], depth + 1);
      if (hit) return hit;
    }
    return null;
  };
  for (const block of blocks) {
    const hit = walk(parseJson(block), 0);
    if (hit) return hit;
  }
  return null;
}

/** ISO-8601-Dauer wie „PT1H30M“ oder „P0DT0H45M“ in Minuten; auch „45 Min.“ */
export function parseDuration(v: Json): number {
  if (typeof v === 'number') return Math.max(0, Math.round(v));
  if (typeof v !== 'string') return 0;
  const s = v.trim().toUpperCase();
  const iso = s.match(/^P(?:(\d+(?:[.,]\d+)?)D)?(?:T(?:(\d+(?:[.,]\d+)?)H)?(?:(\d+(?:[.,]\d+)?)M)?(?:(\d+(?:[.,]\d+)?)S)?)?$/);
  const num = (x?: string) => (x ? Number(x.replace(',', '.')) : 0);
  if (iso) return Math.round(num(iso[1]) * 1440 + num(iso[2]) * 60 + num(iso[3]) + num(iso[4]) / 60);
  const h = s.match(/(\d+(?:[.,]\d+)?)\s*(?:STD|STUNDE|H\b|HOUR)/);
  const m = s.match(/(\d+)\s*(?:MIN|M\b)/);
  if (h || m) return Math.round(num(h?.[1]) * 60 + num(m?.[1]));
  return 0;
}

/** Portionen aus „4“, „4 Portionen“, ["4", "4 Stück"] oder 4 */
export function parseYield(v: Json): number {
  for (const x of asList(v)) {
    if (typeof x === 'number' && x > 0) return Math.min(99, Math.round(x));
    if (typeof x === 'string') {
      const m = x.match(/\d+/);
      if (m && Number(m[0]) > 0) return Math.min(99, Number(m[0]));
    }
    if (isObj(x)) {
      const n = parseYield(x.value ?? x.name);
      if (n) return n;
    }
  }
  return 0;
}

/** Bild-URL aus einer Zeichenkette, einer Liste oder einem ImageObject */
function imageUrl(v: Json): string {
  for (const x of asList(v)) {
    const url = typeof x === 'string' ? x : isObj(x) ? (typeof x.url === 'string' ? x.url : typeof x.contentUrl === 'string' ? x.contentUrl : typeof x['@id'] === 'string' ? x['@id'] : '') : '';
    if (/^https?:\/\//i.test(url.trim())) return url.trim();
  }
  return '';
}

/** Schritte aus Text, Liste von Texten, HowToStep oder HowToSection */
export function parseInstructions(v: Json): string[] {
  const out: string[] = [];
  const add = (text: string) => {
    for (const part of text.split(/\n+/)) {
      const t = cleanText(part).replace(/^(?:schritt\s*)?\d+[.):]\s+/i, '').trim();
      if (t && t !== out[out.length - 1]) out.push(t);
    }
  };
  const walk = (x: Json, depth: number) => {
    if (depth > 6) return;
    if (typeof x === 'string') {
      // Absätze und Listenpunkte im HTML sind eigene Schritte
      add(x.replace(/<\/(?:p|li|div)>|<br\s*\/?>/gi, '\n'));
      return;
    }
    if (Array.isArray(x)) return x.forEach((y) => walk(y, depth + 1));
    if (!isObj(x)) return;
    if (hasType(x, 'HowToSection') || Array.isArray(x.itemListElement)) return walk(x.itemListElement, depth + 1);
    const text = typeof x.text === 'string' ? x.text : typeof x.name === 'string' ? x.name : typeof x.description === 'string' ? x.description : '';
    if (text) add(text.replace(/<\/(?:p|li)>|<br\s*\/?>/gi, '\n'));
  };
  walk(v, 0);
  return out;
}

/** Zutaten säubern: „200&nbsp;g  Feta“ → „200 g Feta“, „▢ 1 Zwiebel“ → „1 Zwiebel“ */
export function cleanIngredient(s: string): string {
  return cleanText(s)
    .replace(/^[▢☐□•·*\-–]\s*/, '')
    .replace(/(\d)\s*(g|kg|ml|l|EL|TL)\b/g, '$1 $2')
    .replace(/\s+([,.)])/g, '$1')
    .trim();
}

/** Schlagwörter aus Kategorie, Küche und Keywords – höchstens vier kurze */
function tagsFrom(r: Obj): string {
  const words: string[] = [];
  for (const v of [r.recipeCategory, r.recipeCuisine, r.keywords]) {
    for (const x of asList(v)) if (typeof x === 'string') words.push(...x.split(','));
  }
  const out: string[] = [];
  for (const w of words.map((x) => cleanText(x)).filter((x) => x && x.length <= 24)) {
    if (!out.some((o) => o.toLowerCase() === w.toLowerCase())) out.push(w);
    if (out.length >= 4) break;
  }
  return out.join(', ');
}

/** Hängt relative Bild-Adressen an die Seite an */
function absolute(url: string, base: string): string {
  if (!url) return '';
  try {
    const u = new URL(url, base);
    return u.protocol === 'http:' || u.protocol === 'https:' ? u.href : '';
  } catch {
    return '';
  }
}

/** Seitentitel ohne „ | Chefkoch“ o. Ä. */
const siteless = (t: string) => t.replace(/\s+[|–—-]\s+[^|–—-]{2,40}$/, '').trim();

/** Übersetzt die Daten einer Seite in ein Daywerk-Rezept. Ohne Rezeptdaten bleiben Titel, Foto und Link. */
export function recipeFromPage(page: PageData, url: string): ImportResult | null {
  const r = findRecipe(page.jsonld);
  if (r) {
    const ingredients = asList(r.recipeIngredient ?? r.ingredients).filter((x): x is string => typeof x === 'string').map(cleanIngredient).filter(Boolean);
    const steps = parseInstructions(r.recipeInstructions);
    const total = parseDuration(r.totalTime) || parseDuration(r.prepTime) + parseDuration(r.cookTime);
    const title = cleanText(r.name) || siteless(page.meta['og:title'] ?? page.title);
    return {
      complete: ingredients.length > 0 || steps.length > 0,
      recipe: {
        title: title || 'Rezept',
        minutes: Math.min(24 * 60, total),
        servings: parseYield(r.recipeYield) || 2,
        ingredients: ingredients.join('\n'),
        steps: steps.join('\n'),
        image: absolute(imageUrl(r.image) || page.meta['og:image'] || page.meta['og:image:secure_url'] || '', url),
        url,
        tags: tagsFrom(r),
      },
    };
  }
  const title = siteless(page.meta['og:title'] || page.meta['twitter:title'] || page.title);
  if (!title) return null;
  return {
    complete: false,
    recipe: {
      title, minutes: 0, servings: 2, ingredients: '', steps: '',
      image: absolute(page.meta['og:image'] || page.meta['og:image:secure_url'] || page.meta['twitter:image'] || '', url),
      url, tags: '',
    },
  };
}

/** Nur echte Web-Adressen; „chefkoch.de/rezepte/…“ ohne https:// wird ergänzt */
export function normalizeRecipeUrl(input: string): string | null {
  const s = input.trim().match(/https?:\/\/\S+|(?:www\.)?[a-z0-9-]+(?:\.[a-z0-9-]+)+\/\S*/i)?.[0];
  if (!s) return null;
  try {
    const u = new URL(/^https?:\/\//i.test(s) ? s : `https://${s}`);
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return null;
    u.hash = '';
    return u.href;
  } catch {
    return null;
  }
}
