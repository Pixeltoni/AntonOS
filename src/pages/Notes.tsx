import { useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { useStore } from '../store';
import type { ID, Note } from '../types';
import { today } from '../lib/dates';
import { START_EASE } from '../lib/srs';
import {
  cardsFromText, dateGroup, extractLinks, extractTags, noteSnippet, noteTitle, parseBlocks, parseInline, toggleCheck, togglePrefix,
  wrapSelection, type DateGroup,
} from '../lib/notes';
import { CourseSelect, Empty } from '../components/ui';
import { useToast } from '../components/toast';

type Folder = 'alle' | 'angeheftet' | 'ohne' | `kurs:${string}`;

const GROUPS: DateGroup[] = ['Heute', 'Gestern', 'Letzte 7 Tage', 'Letzte 30 Tage', 'Älter'];
const stamp = (iso: string) => {
  const d = new Date(iso);
  return `${d.toLocaleDateString('de-DE', { day: 'numeric', month: 'long', year: 'numeric' })} um ${d.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })}`;
};
const listTime = (iso: string, group: DateGroup) => {
  const d = new Date(iso);
  if (group === 'Heute') return d.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
  if (group === 'Gestern') return 'Gestern';
  if (group === 'Letzte 7 Tage') return d.toLocaleDateString('de-DE', { weekday: 'long' });
  return d.toLocaleDateString('de-DE');
};

/** Eine Zeile mit **fett**, *kursiv*, #tags, Links und [[Verknüpfungen]] */
function Inline({ text, onTag, resolve }: { text: string; onTag: (t: string) => void; resolve: (title: string) => string | null }) {
  return (
    <>
      {parseInline(text).map((p, i) => {
        if (p.kind === 'bold') return <strong key={i}>{p.text}</strong>;
        if (p.kind === 'italic') return <em key={i}>{p.text}</em>;
        if (p.kind === 'tag') return <button key={i} type="button" className="note-tag" onClick={(e) => { e.stopPropagation(); onTag(p.text.toLowerCase()); }}>#{p.text}</button>;
        if (p.kind === 'url') return <a key={i} href={p.text} target="_blank" rel="noreferrer noopener" onClick={(e) => e.stopPropagation()}>{p.text}</a>;
        if (p.kind === 'link') {
          const href = resolve(p.text);
          return href ? <a key={i} className="note-link" href={href} onClick={(e) => e.stopPropagation()}>{p.text}</a> : <span key={i} className="note-link missing" title="Nicht gefunden">{p.text}</span>;
        }
        return <span key={i}>{p.text}</span>;
      })}
    </>
  );
}

function useResolver() {
  const { data } = useStore();
  return (title: string): string | null => {
    const t = title.toLowerCase();
    const note = data.notes.find((n) => noteTitle(n).toLowerCase() === t);
    if (note) return `#/notizen/${note.id}`;
    const task = data.tasks.find((x) => x.title.toLowerCase() === t);
    if (task) return '#/aufgaben';
    const course = data.courses.find((c) => c.name.toLowerCase() === t || c.code.toLowerCase() === t);
    if (course) return `#/kurse/${course.id}`;
    return null;
  };
}

function NoteView({ note, onEdit, onTag }: { note: Note; onEdit: () => void; onTag: (t: string) => void }) {
  const { update } = useStore();
  const resolve = useResolver();
  const blocks = parseBlocks(note.content);
  const toggle = (line: number) => update('notes', note.id, { content: toggleCheck(note.content, line), updated: new Date().toISOString() });
  const inline = (text: string) => <Inline text={text} onTag={onTag} resolve={resolve} />;
  const out: ReactNode[] = [];
  let list: ReactNode[] = [];
  const flush = () => {
    if (list.length) out.push(<ul key={`ul-${out.length}`} className="note-ul">{list}</ul>);
    list = [];
  };
  for (const b of blocks) {
    if (b.kind === 'li') {
      list.push(<li key={b.line}>{inline(b.text)}</li>);
      continue;
    }
    flush();
    if (b.kind === 'h1') out.push(<h2 key={b.line} className="note-h1">{inline(b.text)}</h2>);
    else if (b.kind === 'h2') out.push(<h3 key={b.line} className="note-h2">{inline(b.text)}</h3>);
    else if (b.kind === 'p') out.push(<p key={b.line}>{inline(b.text)}</p>);
    else if (b.kind === 'empty') out.push(<div key={b.line} className="note-gap" />);
    else if (b.kind === 'check') {
      out.push(
        <div key={b.line} className={`note-check ${b.done ? 'done' : ''}`}>
          <button
            type="button"
            className="note-check-box"
            role="checkbox"
            aria-checked={b.done}
            aria-label={b.text || 'Punkt'}
            onClick={(e) => {
              e.stopPropagation();
              toggle(b.line);
            }}
          />
          <span>{inline(b.text)}</span>
        </div>,
      );
    }
  }
  flush();
  return (
    <div
      className="note-view"
      onClick={(e) => {
        // Ein Klick auf den Text (nicht auf Häkchen oder Links) öffnet die Bearbeitung
        if (!window.getSelection()?.toString() && !(e.target as HTMLElement).closest('a, button')) onEdit();
      }}
    >
      {note.content.trim() ? out : <p className="muted">Leer – tippe hier, um zu schreiben.</p>}
    </div>
  );
}

function Editor({ note, onTag, onBack }: { note: Note; onTag: (t: string) => void; onBack: () => void }) {
  const { data, add, update, remove } = useStore();
  const { show } = useToast();
  const [editing, setEditing] = useState(!note.content);
  const area = useRef<HTMLTextAreaElement>(null);
  const pending = useRef<{ from: number; to: number } | null>(null);
  const resolve = useResolver();

  useEffect(() => {
    if (editing) area.current?.focus();
  }, [editing]);
  useEffect(() => {
    // Auswahl nach Formatierung wiederherstellen
    if (pending.current && area.current) {
      area.current.setSelectionRange(pending.current.from, pending.current.to);
      pending.current = null;
    }
  });

  const save = (patch: Partial<Note>) => update('notes', note.id, { ...patch, updated: new Date().toISOString() });
  const apply = (fn: (c: string, from: number, to: number) => { content: string; from: number; to: number }) => {
    const el = area.current;
    if (!el) {
      setEditing(true);
      return;
    }
    const r = fn(note.content, el.selectionStart, el.selectionEnd);
    pending.current = { from: r.from, to: r.to };
    save({ content: r.content });
    el.focus();
  };
  const prefix = (p: string) => apply((c, f, t) => togglePrefix(c, f, t, p));

  const onKey = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    const mod = e.metaKey || e.ctrlKey;
    const key = e.key.toLowerCase();
    if (mod && !e.shiftKey && key === 'b') { e.preventDefault(); apply((c, f, t) => wrapSelection(c, f, t, '**')); }
    else if (mod && !e.shiftKey && key === 'i') { e.preventDefault(); apply((c, f, t) => wrapSelection(c, f, t, '*')); }
    else if (mod && e.shiftKey && key === 'l') { e.preventDefault(); prefix('- [ ] '); }
    else if (mod && e.shiftKey && key === 't') { e.preventDefault(); prefix('# '); }
    else if (mod && e.shiftKey && key === 'h') { e.preventDefault(); prefix('## '); }
    else if (key === 'escape') setEditing(false);
    else if (key === 'enter' && !e.shiftKey && !mod) {
      // Listen und Checklisten in der nächsten Zeile fortsetzen – wie in Notizen
      const el = e.currentTarget;
      const pos = el.selectionStart;
      const start = note.content.lastIndexOf('\n', pos - 1) + 1;
      const line = note.content.slice(start, pos);
      const m = line.match(/^(\s*)(- \[[ xX]\] |- )/);
      if (!m) return;
      e.preventDefault();
      if (line.trim() === m[2].trim()) {
        // Leerer Punkt: Liste beenden
        const content = note.content.slice(0, start) + note.content.slice(pos);
        pending.current = { from: start, to: start };
        save({ content });
        return;
      }
      const next = `\n${m[1]}${m[2].startsWith('- [') ? '- [ ] ' : '- '}`;
      pending.current = { from: pos + next.length, to: pos + next.length };
      save({ content: note.content.slice(0, pos) + next + note.content.slice(el.selectionEnd) });
    }
  };

  const makeCards = () => {
    const el = area.current;
    const selected = editing && el && el.selectionEnd > el.selectionStart
      ? note.content.slice(el.selectionStart, el.selectionEnd)
      : window.getSelection()?.toString() ?? '';
    const cards = cardsFromText(selected.trim() || note.content);
    if (cards.length === 0) {
      show('Keine Karten gefunden – schreib z. B. „Begriff: Erklärung“ oder „Frage? Antwort“.', undefined, 6000);
      return;
    }
    const existing = new Set(data.cards.filter((c) => c.noteId === note.id).map((c) => c.front));
    const fresh = cards.filter((c) => !existing.has(c.front));
    for (const c of fresh) add('cards', { ...c, courseId: note.courseId, interval: 0, ease: START_EASE, reps: 0, lapses: 0, due: today(), noteId: note.id });
    show(
      fresh.length ? `🧠 ${fresh.length} ${fresh.length === 1 ? 'Lernkarte' : 'Lernkarten'} angelegt` : 'Diese Karten gibt es schon.',
      fresh.length ? { label: 'Lernen', run: () => (location.hash = note.courseId ? `#/lernen/${note.courseId}` : '#/lernen') } : undefined,
    );
  };

  const links = extractLinks(note.content);
  const cardCount = data.cards.filter((c) => c.noteId === note.id).length;

  return (
    <div className="note-editor">
      <div className="note-toolbar">
        <button type="button" className="note-back" onClick={onBack}>‹ Notizen</button>
        <div className="note-tools">
          <button type="button" onClick={() => prefix('## ')} title="Überschrift (⇧⌘H)" aria-label="Überschrift">Aa</button>
          <button type="button" onClick={() => apply((c, f, t) => wrapSelection(c, f, t, '**'))} title="Fett (⌘B)" aria-label="Fett"><strong>B</strong></button>
          <button type="button" onClick={() => prefix('- ')} title="Liste" aria-label="Liste">•≡</button>
          <button type="button" onClick={() => prefix('- [ ] ')} title="Checkliste (⇧⌘L)" aria-label="Checkliste">☑</button>
          <button type="button" className={note.pinned ? 'on' : ''} onClick={() => save({ pinned: !note.pinned })} title={note.pinned ? 'Loslösen' : 'Anheften'} aria-pressed={!!note.pinned}>📌</button>
          <button type="button" onClick={makeCards} title="Markierten Text (oder die ganze Notiz) in Lernkarten umwandeln" aria-label="In Lernkarten umwandeln">🧠<span className="note-tool-label"> Lernkarten</span></button>
          <button type="button" className="note-done" onClick={() => setEditing((x) => !x)}>{editing ? 'Fertig' : 'Bearbeiten'}</button>
        </div>
      </div>
      <div className="note-meta">
        <span>{stamp(note.updated)}</span>
        <CourseSelect value={note.courseId} onChange={(courseId) => save({ courseId })} />
      </div>
      <input className="note-title" placeholder="Titel" value={note.title} onChange={(e) => save({ title: e.target.value })} aria-label="Titel" />
      {editing ? (
        <textarea
          ref={area}
          className="note-text"
          value={note.content}
          onChange={(e) => save({ content: e.target.value })}
          onKeyDown={onKey}
          placeholder={'Schreib los …\n\n„- [ ] “ für eine Checkliste, „## “ für eine Überschrift, **fett**, #tag, [[Verknüpfung]].\nZeilen wie „Begriff: Erklärung“ werden mit 🧠 zu Lernkarten.'}
          aria-label="Text"
        />
      ) : (
        <NoteView note={note} onEdit={() => setEditing(true)} onTag={onTag} />
      )}
      {(links.length > 0 || cardCount > 0) && (
        <div className="note-links">
          <span aria-hidden>🔗</span>
          <span>
            Verknüpft:{' '}
            {links.map((l, i) => {
              const href = resolve(l);
              return (
                <span key={l}>
                  {i > 0 && ' · '}
                  {href ? <a href={href}>{l}</a> : <span className="muted" title="Nicht gefunden">{l}</span>}
                </span>
              );
            })}
            {cardCount > 0 && (
              <>
                {links.length > 0 && ' · '}
                <a href={note.courseId ? `#/lernen/${note.courseId}` : '#/lernen'}>{cardCount} {cardCount === 1 ? 'Lernkarte' : 'Lernkarten'}</a>
              </>
            )}
          </span>
        </div>
      )}
      <div className="note-footer">
        <button
          type="button"
          className="danger"
          onClick={() => {
            if (confirm(`„${noteTitle(note)}“ löschen?`)) {
              remove('notes', note.id);
              location.hash = '#/notizen';
            }
          }}
        >
          Notiz löschen
        </button>
      </div>
    </div>
  );
}

export function Notes({ selected }: { selected: ID | null }) {
  const { data, add } = useStore();
  const [folder, setFolder] = useState<Folder>('alle');
  const [tag, setTag] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const now = new Date();

  const inFolder = (n: Note) =>
    folder === 'alle' ? true : folder === 'angeheftet' ? !!n.pinned : folder === 'ohne' ? n.courseId === null : n.courseId === folder.slice(5);
  const q = query.trim().toLowerCase();
  const notes = data.notes
    .filter((n) => inFolder(n) && (!tag || extractTags(n.content).includes(tag)) && (!q || `${n.title}\n${n.content}`.toLowerCase().includes(q)))
    .sort((a, b) => b.updated.localeCompare(a.updated));
  const pinned = notes.filter((n) => n.pinned);
  const rest = notes.filter((n) => !n.pinned);
  const note = data.notes.find((n) => n.id === selected);
  const allTags = [...new Set(data.notes.flatMap((n) => extractTags(n.content)))].sort();

  const folders: { id: Folder; label: string; icon: string; count: number }[] = [
    { id: 'alle', label: 'Alle Notizen', icon: '🗂️', count: data.notes.length },
    { id: 'angeheftet', label: 'Angeheftet', icon: '📌', count: data.notes.filter((n) => n.pinned).length },
    ...data.courses.map((c) => ({ id: `kurs:${c.id}` as Folder, label: c.name, icon: '📁', count: data.notes.filter((n) => n.courseId === c.id).length })),
    { id: 'ohne', label: 'Persönlich', icon: '📁', count: data.notes.filter((n) => n.courseId === null).length },
  ];

  const create = () => {
    const courseId = folder.startsWith('kurs:') ? folder.slice(5) : null;
    const id = add('notes', { title: '', courseId, content: tag ? `\n\n#${tag}` : '', updated: new Date().toISOString(), pinned: folder === 'angeheftet' });
    location.hash = `#/notizen/${id}`;
  };

  const row = (n: Note) => {
    const g = dateGroup(n.updated, now);
    return (
      <li key={n.id}>
        <a href={`#/notizen/${n.id}`} className={`note-row ${n.id === selected ? 'active' : ''}`}>
          <strong>{noteTitle(n)}</strong>
          <span><span className="note-row-time">{listTime(n.updated, g)}</span> {noteSnippet(n)}</span>
        </a>
      </li>
    );
  };

  return (
    <div className={`notes-app ${note ? 'has-note' : ''}`}>
      <aside className="notes-folders">
        <h2>Ordner</h2>
        <ul>
          {folders.map((f) => (
            <li key={f.id}>
              <button type="button" className={folder === f.id && !tag ? 'on' : ''} onClick={() => { setFolder(f.id); setTag(null); }}>
                <span>{f.icon} {f.label}</span>
                <span className="muted">{f.count}</span>
              </button>
            </li>
          ))}
        </ul>
        {allTags.length > 0 && (
          <>
            <h2>Tags</h2>
            <div className="notes-tags">
              {allTags.map((t) => (
                <button key={t} type="button" className={tag === t ? 'on' : ''} onClick={() => setTag(tag === t ? null : t)}>#{t}</button>
              ))}
            </div>
          </>
        )}
      </aside>

      <section className="notes-list">
        <div className="notes-list-head">
          <input type="search" placeholder="🔍 Suchen" value={query} onChange={(e) => setQuery(e.target.value)} aria-label="Notizen durchsuchen" />
          <button type="button" className="note-new" onClick={create} title="Neue Notiz" aria-label="Neue Notiz">✎</button>
        </div>
        {tag && (
          <div className="notes-filter">
            Tag <strong>#{tag}</strong> <button type="button" className="icon" onClick={() => setTag(null)} aria-label="Tag-Filter entfernen">×</button>
          </div>
        )}
        {notes.length === 0 ? <Empty>Keine Notizen gefunden.</Empty> : (
          <>
            {pinned.length > 0 && folder !== 'angeheftet' && (
              <>
                <h3 className="notes-group">📌 Angeheftet</h3>
                <ul>{pinned.map(row)}</ul>
              </>
            )}
            {GROUPS.map((g) => {
              const list = (folder === 'angeheftet' ? notes : rest).filter((n) => dateGroup(n.updated, now) === g);
              return list.length === 0 ? null : (
                <div key={g}>
                  <h3 className="notes-group">{g}</h3>
                  <ul>{list.map(row)}</ul>
                </div>
              );
            })}
          </>
        )}
        <p className="notes-count muted small">{notes.length} {notes.length === 1 ? 'Notiz' : 'Notizen'}</p>
      </section>

      <section className="notes-detail">
        {note ? (
          <Editor key={note.id} note={note} onTag={(t) => { setTag(t); setFolder('alle'); }} onBack={() => (location.hash = '#/notizen')} />
        ) : (
          <div className="notes-empty">
            <Empty>Wähle eine Notiz aus oder leg eine neue an.</Empty>
            <button type="button" className="primary" onClick={create}>✎ Neue Notiz</button>
          </div>
        )}
      </section>
    </div>
  );
}
