import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useStore } from '../store';
import { today } from '../lib/dates';
import { DEFAULT_SIDEBAR, mergeWithDefaults } from '../lib/layout';
import { parseQuickAdd } from '../lib/quickadd';
import { categorize, parseShopping } from '../lib/shopping';
import { calculate, matchScore, searchAll, topHit, type SearchHit } from '../lib/search';
import { useFocus } from './focus';
import { useToast } from './toast';

const OPEN_EVENT = 'antonos:spotlight';

/** Öffnet die Suche von überall (z. B. über einen Knopf). */
export const openSpotlight = () => window.dispatchEvent(new Event(OPEN_EVENT));

interface Row {
  key: string;
  group: string;
  icon: string;
  title: string;
  subtitle?: string;
  hint?: string;
  run: () => void;
}

const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);
export const SHORTCUT = isMac ? '⌘K' : 'Strg+K';

function Highlight({ text, query }: { text: string; query: string }) {
  const words = query.trim().split(/\s+/).filter((w) => w.length > 0).map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  if (!words.length) return <>{text}</>;
  const parts = text.split(new RegExp(`(${words.join('|')})`, 'gi'));
  return <>{parts.map((p, i) => (i % 2 === 1 ? <mark key={i}>{p}</mark> : <span key={i}>{p}</span>))}</>;
}

/**
 * Spotlight: ⌘K / Strg+K (oder „/“) öffnet die Suche über alles –
 * mit Aktionen wie Aufgabe anlegen, Fokus starten oder Ausgabe erfassen.
 */
export function Spotlight() {
  const { data, add, mutate } = useStore();
  const { show } = useToast();
  const focus = useFocus();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [index, setIndex] = useState(0);
  const input = useRef<HTMLInputElement>(null);
  const list = useRef<HTMLDivElement>(null);
  const t = today();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const typing = (e.target as HTMLElement | null)?.closest('input, textarea, select, [contenteditable="true"]');
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setOpen((o) => !o);
      } else if (e.key === '/' && !typing && !e.metaKey && !e.ctrlKey) {
        e.preventDefault();
        setOpen(true);
      }
    };
    const onOpen = () => setOpen(true);
    window.addEventListener('keydown', onKey);
    window.addEventListener(OPEN_EVENT, onOpen);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener(OPEN_EVENT, onOpen);
    };
  }, []);

  useEffect(() => {
    if (open) {
      setIndex(0);
      requestAnimationFrame(() => input.current?.select());
    } else setQuery('');
  }, [open]);

  const close = () => setOpen(false);
  const go = (href: string) => {
    close();
    if (/^https?:/.test(href)) window.open(href, '_blank', 'noopener');
    else location.hash = href;
  };

  const pages = mergeWithDefaults(data.settings.sidebar, DEFAULT_SIDEBAR, 'path').filter((p) => !p.hidden);
  const q = query.trim();

  const rows = useMemo<Row[]>(() => {
    const out: Row[] = [];
    if (!q) {
      // Ohne Eingabe: schnelle Wege
      out.push(
        { key: 'a-task', group: 'Vorschläge', icon: '✅', title: 'Neue Aufgabe', hint: 'z. B. „Blatt 4 morgen 10 Uhr“', run: () => go('#/aufgaben') },
        { key: 'a-focus', group: 'Vorschläge', icon: '⏱️', title: focus.timer.active ? 'Zum laufenden Fokus' : 'Fokus starten', run: () => { if (!focus.timer.active) focus.start(); go('#/fokus'); } },
        { key: 'a-note', group: 'Vorschläge', icon: '📝', title: 'Neue Notiz', run: () => { const id = add('notes', { title: '', courseId: null, content: '', updated: new Date().toISOString() }); go(`#/notizen/${id}`); } },
        { key: 'a-shop', group: 'Vorschläge', icon: '🛒', title: 'Einkaufsliste', run: () => go('#/einkauf') },
      );
      for (const p of pages.slice(0, 8)) out.push({ key: `p-${p.path}`, group: 'Seiten', icon: p.icon, title: p.label, run: () => go(`#/${p.path}`) });
      return out;
    }

    const result = calculate(q);
    if (result !== null) {
      const text = result.toLocaleString('de-DE', { maximumFractionDigits: 10 });
      out.push({
        key: 'calc', group: 'Rechner', icon: '🧮', title: `= ${text}`, hint: 'Kopieren',
        run: () => { navigator.clipboard?.writeText(text).catch(() => undefined); show(`${text} kopiert`); close(); },
      });
    }

    const hits = searchAll(data, q, pages);
    const top = topHit(hits);
    const toRow = (h: SearchHit, group = h.group): Row => ({ key: `${group}-${h.key}`, group, icon: h.icon, title: h.title, subtitle: h.subtitle, run: () => go(h.href) });
    if (top && top.score >= 12) out.push(toRow(top, 'Top-Treffer'));
    for (const h of hits) if (!(top && top.score >= 12 && h.key === top.key)) out.push(toRow(h));

    // Aktionen mit dem eingegebenen Text
    const qa = parseQuickAdd(q, t, data.courses);
    const due = qa.due ? new Date(`${qa.due}T12:00`).toLocaleDateString('de-DE', { weekday: 'short', day: 'numeric', month: 'numeric' }) : '';
    out.push({
      key: 'x-task', group: 'Aktionen', icon: '✅', title: `Neue Aufgabe „${qa.title || q}“`,
      hint: [due, qa.dueTime, qa.priority && `Priorität ${qa.priority}`, data.courses.find((c) => c.id === qa.courseId)?.name].filter(Boolean).join(' · ') || '↵',
      run: () => {
        add('tasks', { title: qa.title || q, courseId: qa.courseId, kind: 'Aufgabe', status: 'offen', priority: qa.priority ?? 'mittel', due: qa.due, dueTime: qa.dueTime });
        show(`Aufgabe „${qa.title || q}“ angelegt`, { label: 'Ansehen', run: () => (location.hash = '#/aufgaben') });
        close();
      },
    });
    const money = q.match(/^(\d+(?:[.,]\d{1,2})?)\s*€?\s+(.+)$/) ?? q.match(/^(.+?)\s+(\d+(?:[.,]\d{1,2})?)\s*€?$/);
    if (money) {
      const [amountRaw, desc] = /^\d/.test(money[1]) ? [money[1], money[2]] : [money[2], money[1]];
      const amount = Number(amountRaw.replace(',', '.'));
      out.push({
        key: 'x-expense', group: 'Aktionen', icon: '💸', title: `Ausgabe ${amount.toLocaleString('de-DE', { style: 'currency', currency: 'EUR' })} „${desc}“`, hint: 'heute buchen',
        run: () => {
          mutate((d) => ({ ...d, transactions: [...d.transactions, { id: crypto.randomUUID(), type: 'Ausgabe', description: desc, amount, category: 'Sonstiges', account: 'Girokonto', date: t }] }));
          show(`Ausgabe „${desc}“ gebucht`, { label: 'Finanzen', run: () => (location.hash = '#/finanzen') });
          close();
        },
      });
    }
    out.push({
      key: 'x-note', group: 'Aktionen', icon: '📝', title: `Neue Notiz „${q}“`,
      run: () => { const id = add('notes', { title: q, courseId: null, content: '', updated: new Date().toISOString() }); go(`#/notizen/${id}`); },
    });
    const items = parseShopping(q);
    out.push({
      key: 'x-shop', group: 'Aktionen', icon: '🛒', title: `Auf die Einkaufsliste: ${items.map((i) => i.name).join(', ')}`,
      run: () => {
        for (const i of items) add('shopping', { name: i.name, amount: i.amount, aisle: categorize(i.name), done: false, added: t });
        show(`${items.length} ${items.length === 1 ? 'Artikel' : 'Artikel'} auf der Einkaufsliste`, { label: 'Ansehen', run: () => (location.hash = '#/einkauf') });
        close();
      },
    });
    const course = data.courses.map((c) => ({ c, s: matchScore(q, c.name, c.code) })).filter((x) => x.s > 0).sort((a, b) => b.s - a.s)[0]?.c;
    out.push({
      key: 'x-focus', group: 'Aktionen', icon: '⏱️', title: course ? `Fokus starten: ${course.name}` : 'Fokus starten', hint: `${focus.timer.config.work} Min.`,
      run: () => {
        // Ein laufender Timer läuft einfach weiter
        if (!focus.timer.active) {
          if (course) focus.configure({ courseId: course.id, mode: 'lernen' });
          focus.start();
        }
        go('#/fokus');
      },
    });
    return out;
  }, [q, data, pages, focus, t]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => setIndex(0), [q]);
  useEffect(() => {
    list.current?.querySelector<HTMLElement>(`[data-index="${index}"]`)?.scrollIntoView({ block: 'nearest' });
  }, [index]);

  if (!open) return null;

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setIndex((i) => Math.min(rows.length - 1, i + 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setIndex((i) => Math.max(0, i - 1)); }
    else if (e.key === 'Enter') { e.preventDefault(); rows[index]?.run(); }
    else if (e.key === 'Escape') { e.preventDefault(); close(); }
  };

  let lastGroup = '';
  return createPortal(
    <div className="spotlight-backdrop" onMouseDown={(e) => e.target === e.currentTarget && close()}>
      <div className="spotlight" role="dialog" aria-modal="true" aria-label="Suche">
        <div className="spotlight-input">
          <span aria-hidden>🔍</span>
          <input
            ref={input}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder="Suchen oder Befehl eingeben …"
            aria-label="Suchen"
            role="combobox"
            aria-expanded="true"
            aria-controls="spotlight-list"
            aria-activedescendant={rows[index] ? `sp-${index}` : undefined}
            autoComplete="off"
            spellCheck={false}
          />
          <kbd className="spotlight-kbd">{SHORTCUT}</kbd>
          <button type="button" className="spotlight-close" onClick={close} aria-label="Schließen">Abbrechen</button>
        </div>
        <div className="spotlight-list" id="spotlight-list" role="listbox" ref={list}>
          {rows.map((r, i) => {
            const header = r.group !== lastGroup ? r.group : null;
            lastGroup = r.group;
            return (
              <div key={r.key}>
                {header && <div className="spotlight-group">{header}</div>}
                <div
                  id={`sp-${i}`}
                  data-index={i}
                  role="option"
                  aria-selected={i === index}
                  className={`spotlight-row ${i === index ? 'on' : ''}`}
                  onMouseMove={() => i !== index && setIndex(i)}
                  onClick={() => r.run()}
                >
                  <span className="spotlight-icon" aria-hidden>{r.icon}</span>
                  <span className="spotlight-text">
                    <span className="spotlight-title"><Highlight text={r.title} query={r.group === 'Aktionen' ? '' : q} /></span>
                    {r.subtitle && <span className="spotlight-sub">{r.subtitle}</span>}
                  </span>
                  {r.hint && <span className="spotlight-hint">{r.hint}</span>}
                </div>
              </div>
            );
          })}
        </div>
        <div className="spotlight-foot">
          <span><kbd>↑</kbd><kbd>↓</kbd> auswählen</span>
          <span><kbd>↵</kbd> öffnen</span>
          <span><kbd>esc</kbd> schließen</span>
        </div>
      </div>
    </div>,
    document.body,
  );
}
