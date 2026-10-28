import type { Data, NavItem } from '../types';
import { noteTitle } from './notes';

export interface SearchHit {
  key: string;
  group: string;
  icon: string;
  title: string;
  subtitle: string;
  href: string;
  score: number;
}

/** Reihenfolge der Gruppen in der Trefferliste */
export const GROUP_ORDER = ['Seiten', 'Aufgaben', 'Notizen', 'Lernkarten', 'Termine', 'Prüfungen', 'Kurse', 'Projekte', 'Ziele', 'Gewohnheiten', 'Menschen', 'Rezepte', 'Reisen', 'Abos', 'Einkaufsliste', 'Medien', 'Buchungen', 'Tools'];

const norm = (s: string) => s.toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/ß/g, 'ss');

/**
 * Wie gut passt `text` zur Suche? 0 = gar nicht. Alle Suchwörter müssen vorkommen;
 * Treffer am Anfang des Titels oder eines Wortes zählen mehr.
 */
export function matchScore(query: string, title: string, extra = ''): number {
  const words = norm(query).split(/\s+/).filter(Boolean);
  if (words.length === 0) return 0;
  const t = norm(title);
  const e = norm(extra);
  let score = 0;
  for (const w of words) {
    if (t.startsWith(w)) score += 12;
    else if (new RegExp(`(^|[\\s\\-_/(„"'#])${w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`).test(t)) score += 8;
    else if (t.includes(w)) score += 5;
    else if (e.includes(w)) score += 2;
    else return 0;
  }
  if (t === norm(query).trim()) score += 10;
  return score;
}

/** Durchsucht alle Bereiche von AntonOS. */
export function searchAll(data: Data, query: string, pages: NavItem[], limitPerGroup = 5): SearchHit[] {
  if (!query.trim()) return [];
  const hits: SearchHit[] = [];
  const course = (id: string | null | undefined) => data.courses.find((c) => c.id === id)?.name ?? '';
  const push = (h: Omit<SearchHit, 'score'>, title: string, extra = '', bonus = 0) => {
    const score = matchScore(query, title, extra);
    if (score > 0) hits.push({ ...h, score: score + bonus });
  };

  for (const p of pages) push({ key: `page-${p.path}`, group: 'Seiten', icon: p.icon, title: p.label, subtitle: 'Seite öffnen', href: `#/${p.path}` }, p.label, '', 2);
  for (const t of data.tasks) {
    push(
      { key: `task-${t.id}`, group: 'Aufgaben', icon: t.status === 'erledigt' ? '☑️' : '⭕', title: t.title, subtitle: [course(t.courseId), t.due ? new Date(`${t.due}T12:00`).toLocaleDateString('de-DE') : '', t.status === 'erledigt' ? 'erledigt' : ''].filter(Boolean).join(' · '), href: '#/aufgaben' },
      t.title, `${t.note ?? ''} ${(t.subtasks ?? []).map((s) => s.title).join(' ')}`, t.status === 'erledigt' ? -3 : 1,
    );
  }
  for (const n of data.notes) {
    const title = noteTitle(n);
    push({ key: `note-${n.id}`, group: 'Notizen', icon: '📝', title, subtitle: snippetAround(n.content, query) || course(n.courseId), href: `#/notizen/${n.id}` }, title, n.content);
  }
  for (const c of data.cards) push({ key: `card-${c.id}`, group: 'Lernkarten', icon: '🧠', title: c.front, subtitle: `${course(c.courseId) || 'Lernkarte'} · ${c.back.slice(0, 60)}`, href: c.courseId ? `#/lernen/${c.courseId}` : '#/lernen' }, c.front, c.back);
  for (const e of data.events) push({ key: `ev-${e.id}`, group: 'Termine', icon: '🗓️', title: e.title, subtitle: `${new Date(`${e.start}T12:00`).toLocaleDateString('de-DE')}${e.startTime ? `, ${e.startTime}` : ''}`, href: '#/kalender' }, e.title, e.note);
  for (const x of data.exams) push({ key: `exam-${x.id}`, group: 'Prüfungen', icon: '📅', title: x.title, subtitle: `${new Date(`${x.date}T12:00`).toLocaleDateString('de-DE')} · ${x.location}`, href: '#/pruefungen' }, x.title, `${course(x.courseId)} ${x.location}`);
  for (const c of data.courses) push({ key: `course-${c.id}`, group: 'Kurse', icon: '📚', title: c.name, subtitle: [c.code, c.lecturer, c.room].filter(Boolean).join(' · '), href: `#/kurse/${c.id}` }, c.name, `${c.code} ${c.lecturer} ${c.room}`);
  for (const p of data.projects) push({ key: `proj-${p.id}`, group: 'Projekte', icon: '🚀', title: p.title, subtitle: p.status, href: `#/projekte/${p.id}` }, p.title, p.description);
  for (const g of data.goals) push({ key: `goal-${g.id}`, group: 'Ziele', icon: '🎯', title: g.title, subtitle: `${g.area} · ${g.progress} %`, href: '#/ziele' }, g.title, g.why);
  for (const h of data.habits) push({ key: `habit-${h.id}`, group: 'Gewohnheiten', icon: h.icon, title: h.name, subtitle: 'Gewohnheit', href: '#/gewohnheiten' }, h.name);
  for (const p of data.people ?? []) {
    const bday = p.birthday ? `Geburtstag ${Number(p.birthday.slice(3))}.${Number(p.birthday.slice(0, 2))}.` : '';
    push({ key: `person-${p.id}`, group: 'Menschen', icon: '👤', title: p.name, subtitle: [p.group, bday].filter(Boolean).join(' · ') || 'Mensch', href: `#/menschen/${p.id}` }, p.name, `${p.group} ${p.note} ${p.gifts.map((g) => g.title).join(' ')}`);
  }
  for (const r of data.recipes ?? []) push({ key: `recipe-${r.id}`, group: 'Rezepte', icon: '🍽️', title: r.title, subtitle: [r.minutes ? `${r.minutes} Min.` : '', r.tags].filter(Boolean).join(' · ') || 'Rezept', href: `#/essen/${r.id}` }, r.title, `${r.tags} ${r.ingredients}`);
  for (const t of data.trips ?? []) push({ key: `trip-${t.id}`, group: 'Reisen', icon: '✈️', title: t.title, subtitle: `${new Date(`${t.start}T12:00`).toLocaleDateString('de-DE')} – ${new Date(`${t.end}T12:00`).toLocaleDateString('de-DE')}`, href: `#/reisen/${t.id}` }, t.title, t.note);
  for (const r of data.recurring) if (r.type === 'Ausgabe') push({ key: `abo-${r.id}`, group: 'Abos', icon: '🔁', title: r.description || r.category, subtitle: `${r.amount.toLocaleString('de-DE', { style: 'currency', currency: 'EUR' })} · ${r.category}`, href: '#/abos' }, r.description || r.category, r.category);
  for (const s of data.shopping) push({ key: `shop-${s.id}`, group: 'Einkaufsliste', icon: s.done ? '☑️' : '🛒', title: s.name, subtitle: s.amount || 'Einkaufsliste', href: '#/einkauf' }, s.name);
  for (const m of data.media) {
    const read = m.kind === 'Buch' || m.kind === 'Hörbuch';
    push({ key: `media-${m.id}`, group: 'Medien', icon: read ? '📖' : '📺', title: m.title, subtitle: [m.kind, m.creator, m.progress].filter(Boolean).join(' · '), href: read ? '#/lesen' : '#/schauen' }, m.title, m.creator);
  }
  for (const t of data.transactions) {
    push(
      { key: `tx-${t.id}`, group: 'Buchungen', icon: '💸', title: t.description || t.category, subtitle: `${t.type === 'Ausgabe' ? '−' : '+'}${t.amount.toLocaleString('de-DE', { style: 'currency', currency: 'EUR' })} · ${new Date(`${t.date}T12:00`).toLocaleDateString('de-DE')}`, href: '#/finanzen' },
      t.description || t.category, `${t.category} ${t.account}`, -1,
    );
  }
  for (const t of data.tools) push({ key: `tool-${t.id}`, group: 'Tools', icon: '🧰', title: t.name, subtitle: t.url, href: t.url }, t.name, t.category);

  // Pro Gruppe die besten Treffer, Gruppen in fester Reihenfolge
  const out: SearchHit[] = [];
  for (const g of GROUP_ORDER) {
    out.push(...hits.filter((h) => h.group === g).sort((a, b) => b.score - a.score || a.title.localeCompare(b.title)).slice(0, limitPerGroup));
  }
  return out;
}

/** Bester Treffer insgesamt (für „Top-Treffer“) */
export function topHit(hits: SearchHit[]): SearchHit | null {
  return hits.reduce<SearchHit | null>((best, h) => (!best || h.score > best.score ? h : best), null);
}

/** Textausschnitt rund um das erste Suchwort */
export function snippetAround(text: string, query: string, radius = 40): string {
  const w = norm(query).split(/\s+/).filter(Boolean)[0];
  if (!w) return '';
  const clean = text.replace(/\s+/g, ' ').replace(/[#*[\]]/g, '');
  const i = norm(clean).indexOf(w);
  if (i < 0) return '';
  const start = Math.max(0, i - radius);
  return `${start > 0 ? '…' : ''}${clean.slice(start, i + w.length + radius).trim()}${i + w.length + radius < clean.length ? '…' : ''}`;
}

/**
 * Kleiner Rechner wie in Spotlight: + − × ÷, Klammern, Prozent und Komma.
 * Gibt null zurück, wenn die Eingabe keine Rechnung ist.
 */
export function calculate(input: string): number | null {
  const src = input.replace(/\s+/g, '').replace(/,/g, '.').replace(/[×x]/g, '*').replace(/[÷:]/g, '/').replace(/−/g, '-');
  if (!/^[\d.+\-*/()%]+$/.test(src) || !/\d/.test(src) || !/[+\-*/%]/.test(src.replace(/^-/, ''))) return null;
  let pos = 0;
  const peek = () => src[pos];
  const num = (): number => {
    if (peek() === '(') {
      pos++;
      const v = expr();
      if (peek() !== ')') throw new Error('Klammer');
      pos++;
      return v;
    }
    if (peek() === '-') {
      pos++;
      return -num();
    }
    const m = src.slice(pos).match(/^\d+(\.\d+)?/);
    if (!m) throw new Error('Zahl');
    pos += m[0].length;
    let v = Number(m[0]);
    if (peek() === '%') {
      pos++;
      v /= 100;
    }
    return v;
  };
  const term = (): number => {
    let v = num();
    while (peek() === '*' || peek() === '/') {
      const op = src[pos++];
      const r = num();
      v = op === '*' ? v * r : v / r;
    }
    return v;
  };
  const expr = (): number => {
    let v = term();
    while (peek() === '+' || peek() === '-') {
      const op = src[pos++];
      const r = term();
      v = op === '+' ? v + r : v - r;
    }
    return v;
  };
  try {
    const v = expr();
    return pos === src.length && Number.isFinite(v) ? Math.round(v * 1e10) / 1e10 : null;
  } catch {
    return null;
  }
}
