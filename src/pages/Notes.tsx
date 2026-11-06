import { useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import {
  ArrowUpRight, Bold, Brain, CalendarDays, CircleCheck, File, GraduationCap, Hash, Heading, Italic, Keyboard, Layers, LayoutGrid, Lightbulb, Link2, List,
  ListChecks, Pin, Quote, RotateCcw, ShoppingBasket, Smile, SquarePen, Trash2, Users, type LucideIcon,
} from 'lucide-react';
import { useStore } from '../store';
import type { ID, Note, Task } from '../types';
import { relativeLabel, today } from '../lib/dates';
import { START_EASE } from '../lib/srs';
import {
  backlinks, cardsFromText, dailyContent, dailyTitle, dateGroup, extractLinks, extractTags, liveNotes, NOTE_COLORS, NOTE_EMOJIS, NOTE_TEMPLATES,
  noteSnippet, noteTitle, parseBlocks, parseInline, toggleCheck, togglePrefix, trashDaysLeft, wrapSelection, wrapWith, type Block, type DateGroup,
  type NoteTemplate,
} from '../lib/notes';
import { parseQuickAdd } from '../lib/quickadd';
import { onDay, sortEntries } from '../lib/calendar';
import { CourseSelect, Empty } from '../components/ui';
import { Sheet } from '../components/sheet';
import { useToast } from '../components/toast';
import { useTaskUI } from '../components/taskui';
import { useCalendarEntries } from '../components/calendar';

type Folder = 'alle' | 'angeheftet' | 'ohne' | 'tage' | 'geloescht' | `kurs:${string}`;

/** Gerade aus Vorlage oder als Tagesnotiz angelegt: öffnet direkt zum Schreiben */
let freshNote: ID | null = null;

/** Liste oder Galerie – gemerkt auf diesem Gerät */
const VIEW_KEY = 'antonos:notizen-ansicht';
const TEMPLATE_ICONS: Record<NoteTemplate['icon'], LucideIcon> = { file: File, 'graduation-cap': GraduationCap, users: Users, layers: Layers, smile: Smile, 'shopping-basket': ShoppingBasket };

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
    const note = liveNotes(data.notes).find((n) => noteTitle(n).toLowerCase() === t);
    if (note) return `#/notizen/${note.id}`;
    const task = data.tasks.find((x) => x.title.toLowerCase() === t);
    if (task) return '#/aufgaben';
    const course = data.courses.find((c) => c.name.toLowerCase() === t || c.code.toLowerCase() === t);
    if (course) return `#/kurse/${course.id}`;
    return null;
  };
}

/** Farbe einer Notiz: eigene, sonst die des Kurses, sonst Notizen-Gelb */
function useNoteColor() {
  const { data } = useStore();
  return (note: Pick<Note, 'color' | 'courseId'>) => note.color || data.courses.find((c) => c.id === note.courseId)?.color || '#E0A800';
}

/** Symbol einer Notiz im farbigen Feld */
function NoteIcon({ note, size = 34 }: { note: Pick<Note, 'icon' | 'color' | 'courseId' | 'daily'>; size?: number }) {
  const color = useNoteColor()(note);
  return (
    <span className="note-ico" style={{ ['--c' as string]: color, width: size, height: size, fontSize: size * 0.5 }} aria-hidden>
      {note.icon || (note.daily ? '☀️' : <File size={size * 0.48} strokeWidth={2.2} />)}
    </span>
  );
}

/** Checkpunkt → Aufgabe: Knopf neben dem Haken bzw. Hinweis, wenn es die Aufgabe schon gibt */
function CheckTask({ note, block, task }: { note: Note; block: Extract<Block, { kind: 'check' }>; task: Task | undefined }) {
  const { data, add } = useStore();
  const ui = useTaskUI();
  const { show } = useToast();
  const t = today();
  if (task) {
    const done = task.status === 'erledigt';
    return (
      <button type="button" className="note-task linked" onClick={(e) => { e.stopPropagation(); ui.open(task.id); }} title="Aufgabe öffnen">
        <CircleCheck size={12} aria-hidden />
        {done ? 'Erledigt' : task.due ? relativeLabel(task.due, t).replace(/^./, (c) => c.toUpperCase()) : 'In Aufgaben'}
      </button>
    );
  }
  if (block.done || !block.text.trim()) return null;
  const create = (e: React.MouseEvent) => {
    e.stopPropagation();
    const parsed = parseQuickAdd(block.text, t, data.courses, data.taskLists);
    const id = add('tasks', {
      title: parsed.title || block.text.trim(),
      courseId: parsed.listId ? null : parsed.courseId ?? note.courseId,
      listId: parsed.listId ?? null,
      due: parsed.due ?? null,
      dueTime: parsed.dueTime,
      kind: 'Aufgabe',
      priority: parsed.priority ?? 'mittel',
      status: 'offen',
      note: '',
      subtasks: [],
      plannedFor: parsed.evening ? t : null,
      evening: parsed.evening,
      someday: parsed.someday,
      ...(parsed.tags.length ? { tags: parsed.tags } : {}),
      ...(parsed.estimate ? { estimate: parsed.estimate } : {}),
      noteId: note.id,
      noteLine: block.text.trim(),
    });
    show('In Aufgaben angelegt – der Haken bleibt verbunden.', { label: 'Öffnen', run: () => ui.open(id) });
  };
  return (
    <button type="button" className="note-task" onClick={create} title="Als Aufgabe anlegen (Datum im Text wird erkannt, z. B. „morgen“)">
      <ArrowUpRight size={12} aria-hidden />Aufgabe
    </button>
  );
}

function NoteView({ note, onEdit, onTag }: { note: Note; onEdit: () => void; onTag: (t: string) => void }) {
  const { data, update } = useStore();
  const resolve = useResolver();
  const blocks = parseBlocks(note.content);
  const linked = data.tasks.filter((x) => x.noteId === note.id && x.noteLine);
  // Steht derselbe Text mehrmals da, ist nur der erste Punkt mit einer Aufgabe verbunden
  const firstLine = new Map<string, number>();
  for (const b of blocks) if (b.kind === 'check' && !firstLine.has(b.text.trim())) firstLine.set(b.text.trim(), b.line);
  const linkable = (line: number, text: string) => firstLine.get(text.trim()) === line;
  const taskFor = (line: number, text: string) =>
    linkable(line, text) ? linked.find((x) => x.noteLine === text.trim()) : undefined;
  const toggle = (line: number, text: string, done: boolean) => {
    update('notes', note.id, { content: toggleCheck(note.content, line), updated: new Date().toISOString() });
    // Verbundene Aufgabe mit abhaken bzw. wieder öffnen
    const task = taskFor(line, text);
    if (task && (task.status === 'erledigt') === done) update('tasks', task.id, { status: done ? 'offen' : 'erledigt' });
  };
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
    else if (b.kind === 'quote') out.push(<blockquote key={b.line} className="note-quote">{inline(b.text)}</blockquote>);
    else if (b.kind === 'callout') out.push(<div key={b.line} className="note-callout"><Lightbulb size={17} aria-hidden /><span>{inline(b.text)}</span></div>);
    else if (b.kind === 'hr') out.push(<hr key={b.line} className="note-hr" />);
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
              toggle(b.line, b.text, b.done);
            }}
          />
          <span className="grow">{inline(b.text)}</span>
          {linkable(b.line, b.text) && <CheckTask note={note} block={b} task={taskFor(b.line, b.text)} />}
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

/** Abstand der Tastatur vom unteren Rand (iPhone), damit die Formatleiste darüber sitzt */
function useKeyboardInset(active: boolean): number {
  const [inset, setInset] = useState(0);
  useEffect(() => {
    const vv = window.visualViewport;
    if (!active || !vv) return;
    const measure = () => setInset(Math.max(0, Math.round(window.innerHeight - vv.height - vv.offsetTop)));
    measure();
    vv.addEventListener('resize', measure);
    vv.addEventListener('scroll', measure);
    return () => {
      vv.removeEventListener('resize', measure);
      vv.removeEventListener('scroll', measure);
    };
  }, [active]);
  return inset;
}

/** Symbol und Farbe einer Notiz wählen */
function IconSheet({ note, onClose }: { note: Note; onClose: () => void }) {
  const { update } = useStore();
  const color = useNoteColor()(note);
  const set = (patch: Partial<Note>) => update('notes', note.id, patch);
  return (
    <Sheet title="Symbol und Farbe" onClose={onClose}>
      <div className="note-icon-preview"><NoteIcon note={note} size={56} /></div>
      <div className="note-emoji-grid" role="radiogroup" aria-label="Symbol">
        {NOTE_EMOJIS.map((e) => (
          <button key={e} type="button" role="radio" aria-checked={note.icon === e} className={note.icon === e ? 'on' : ''} onClick={() => set({ icon: e })}>{e}</button>
        ))}
      </div>
      <div className="color-dots note-color-dots" role="radiogroup" aria-label="Farbe">
        {NOTE_COLORS.map((c) => (
          <button key={c} type="button" role="radio" aria-checked={color === c} aria-label={c} className={color === c ? 'on' : ''} style={{ background: c }} onClick={() => set({ color: c })} />
        ))}
      </div>
      <button type="button" className="note-icon-reset" onClick={() => set({ icon: undefined, color: undefined })}>Ohne eigenes Symbol (Farbe vom Kurs)</button>
    </Sheet>
  );
}

function Editor({ note, onTag, onBack }: { note: Note; onTag: (t: string) => void; onBack: () => void }) {
  const { data, add, update } = useStore();
  const { show } = useToast();
  const ui = useTaskUI();
  const [editing, setEditing] = useState(() => !note.content || freshNote === note.id);
  const [iconSheet, setIconSheet] = useState(false);
  const kbInset = useKeyboardInset(editing);
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
  const mentions = backlinks(note, data.notes);
  const tasks = data.tasks.filter((x) => x.noteId === note.id);
  const trash = () => {
    update('notes', note.id, { deletedAt: new Date().toISOString() });
    location.hash = '#/notizen';
    show(`„${noteTitle(note)}“ liegt 30 Tage in „Zuletzt gelöscht“.`, { label: 'Widerrufen', run: () => update('notes', note.id, { deletedAt: undefined }) });
  };
  // Formatleiste über der Tastatur: Knöpfe dürfen den Cursor im Text nicht wegnehmen
  const keep = (e: React.PointerEvent | React.MouseEvent) => e.preventDefault();
  const bar: [string, ReactNode, () => void][] = [
    ['Überschrift', <Heading size={18} />, () => prefix('## ')],
    ['Fett', <Bold size={18} />, () => apply((c, f, t) => wrapSelection(c, f, t, '**'))],
    ['Kursiv', <Italic size={18} />, () => apply((c, f, t) => wrapSelection(c, f, t, '*'))],
    ['Liste', <List size={18} />, () => prefix('- ')],
    ['Checkliste', <ListChecks size={18} />, () => prefix('- [ ] ')],
    ['Zitat', <Quote size={17} />, () => prefix('> ')],
    ['Hinweis', <Lightbulb size={17} />, () => prefix('! ')],
    ['Verknüpfen', <Link2 size={18} />, () => apply((c, f, t) => wrapWith(c, f, t, '[[', ']]'))],
    ['Tag', <Hash size={17} />, () => apply((c, f, t) => wrapWith(c, f, t, '#', ''))],
    ['Lernkarten', <Brain size={17} />, makeCards],
  ];

  return (
    <div className={`note-editor ${editing ? 'editing' : ''}`}>
      <div className="note-toolbar">
        <button type="button" className="note-back" onClick={onBack}>‹ Notizen</button>
        <div className="note-tools">
          <button type="button" onClick={() => prefix('## ')} title="Überschrift (⇧⌘H)" aria-label="Überschrift">Aa</button>
          <button type="button" onClick={() => apply((c, f, t) => wrapSelection(c, f, t, '**'))} title="Fett (⌘B)" aria-label="Fett"><strong>B</strong></button>
          <button type="button" onClick={() => prefix('- ')} title="Liste" aria-label="Liste">•≡</button>
          <button type="button" onClick={() => prefix('- [ ] ')} title="Checkliste (⇧⌘L)" aria-label="Checkliste">☑</button>
          <button type="button" className={note.pinned ? 'on' : ''} onClick={() => save({ pinned: !note.pinned })} title={note.pinned ? 'Loslösen' : 'Anheften'} aria-pressed={!!note.pinned}>📌</button>
          <button type="button" onClick={makeCards} title="Markierten Text (oder die ganze Notiz) in Lernkarten umwandeln" aria-label="In Lernkarten umwandeln">🧠<span className="note-tool-label"> Lernkarten</span></button>
        </div>
        <button type="button" className="note-done" onClick={() => setEditing((x) => !x)}>{editing ? 'Fertig' : 'Bearbeiten'}</button>
      </div>
      <div className="note-meta">
        <span>{stamp(note.updated)}</span>
        <CourseSelect value={note.courseId} onChange={(courseId) => save({ courseId })} />
      </div>
      <div className="note-title-row">
        <button type="button" className="note-icon-btn" onClick={() => setIconSheet(true)} aria-label="Symbol und Farbe wählen" title="Symbol und Farbe">
          <NoteIcon note={note} size={40} />
        </button>
        <input className="note-title" placeholder="Titel" value={note.title} onChange={(e) => save({ title: e.target.value })} aria-label="Titel" />
      </div>
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
      {(mentions.length > 0 || tasks.length > 0) && (
        <section className="note-backlinks" aria-label="Erwähnt in">
          <h4>Erwähnt in</h4>
          <ul>
            {mentions.map((n) => (
              <li key={n.id}>
                <a href={`#/notizen/${n.id}`}>
                  <NoteIcon note={n} size={30} />
                  <span><strong>{noteTitle(n)}</strong><small>{noteSnippet(n)}</small></span>
                </a>
              </li>
            ))}
            {tasks.map((x) => (
              <li key={x.id}>
                <button type="button" onClick={() => ui.open(x.id)}>
                  <span className="note-ico" style={{ ['--c' as string]: x.status === 'erledigt' ? '#8E8E93' : '#007AFF', width: 30, height: 30 }} aria-hidden><CircleCheck size={16} /></span>
                  <span><strong className={x.status === 'erledigt' ? 'done' : ''}>{x.title}</strong><small>Aufgabe{x.status === 'erledigt' ? ' · erledigt' : x.due ? ` · ${relativeLabel(x.due, today())}` : ''}</small></span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}
      <div className="note-footer">
        <button type="button" className="danger" onClick={trash}><Trash2 size={14} aria-hidden /> Notiz löschen</button>
      </div>
      {editing && (
        <div
          className="note-kbd-bar"
          role="toolbar"
          aria-label="Format"
          style={{ bottom: kbInset > 0 ? kbInset : 'var(--tabbar-space, 0px)' }}
          onPointerDown={keep}
          onMouseDown={keep}
        >
          <div className="note-kbd-scroll">
            {bar.map(([label, icon, run]) => (
              <button key={label} type="button" aria-label={label} title={label} onClick={run}>{icon}</button>
            ))}
          </div>
          <button type="button" className="note-kbd-done" onClick={() => setEditing(false)} aria-label="Fertig"><Keyboard size={18} aria-hidden /> Fertig</button>
        </div>
      )}
      {iconSheet && <IconSheet note={note} onClose={() => setIconSheet(false)} />}
    </div>
  );
}

/** Kleine Vorschau einer Notiz für die Galerie */
function GalleryPreview({ note }: { note: Note }) {
  const blocks = parseBlocks(note.content).filter((b) => b.kind !== 'empty').slice(0, 9);
  const clean = (t: string) => t.replace(/\*\*|\[\[|\]\]/g, '');
  return (
    <span className="note-card-pv" aria-hidden>
      {blocks.map((b) =>
        b.kind === 'hr' ? <i key={b.line} className="pv-hr" />
          : b.kind === 'check' ? <span key={b.line} className={`pv-check ${b.done ? 'done' : ''}`}>{clean(b.text)}</span>
          : b.kind === 'h1' || b.kind === 'h2' ? <b key={b.line}>{clean(b.text)}</b>
          : b.kind === 'callout' ? <span key={b.line} className="pv-callout">{clean(b.text)}</span>
          : 'text' in b ? <span key={b.line}>{clean(b.text)}</span> : null,
      )}
      {!blocks.length && <span className="muted">Leer</span>}
    </span>
  );
}

export function Notes({ selected }: { selected: ID | null }) {
  const { data, add, update, remove, mutate } = useStore();
  const { show } = useToast();
  const entries = useCalendarEntries();
  const noteColor = useNoteColor();
  const [folder, setFolder] = useState<Folder>('alle');
  const [tag, setTag] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [templates, setTemplates] = useState(false);
  const [gallery, setGalleryState] = useState(() => {
    try {
      return localStorage.getItem(VIEW_KEY) === 'galerie';
    } catch {
      return false;
    }
  });
  const setGallery = (on: boolean) => {
    setGalleryState(on);
    try {
      localStorage.setItem(VIEW_KEY, on ? 'galerie' : 'liste');
    } catch {
      // egal – dann eben nur für jetzt
    }
  };
  const now = new Date();
  const t = today();

  const live = liveNotes(data.notes);
  const trash = data.notes.filter((n) => n.deletedAt).sort((a, b) => b.deletedAt!.localeCompare(a.deletedAt!));
  const inFolder = (n: Note) =>
    folder === 'alle' ? true
      : folder === 'angeheftet' ? !!n.pinned
      : folder === 'tage' ? !!n.daily
      : folder === 'ohne' ? n.courseId === null
      : n.courseId === folder.slice(5);
  const q = query.trim().toLowerCase();
  const matches = (n: Note) => (!tag || extractTags(n.content).includes(tag)) && (!q || `${n.title}\n${n.content}`.toLowerCase().includes(q));
  const notes = live.filter((n) => inFolder(n) && matches(n)).sort((a, b) => b.updated.localeCompare(a.updated));
  const pinned = notes.filter((n) => n.pinned);
  const rest = notes.filter((n) => !n.pinned);
  const note = live.find((n) => n.id === selected);
  const allTags = [...new Set(live.flatMap((n) => extractTags(n.content)))].sort();
  const dailyCount = live.filter((n) => n.daily).length;

  const folders: { id: Folder; label: string; icon: string; count: number }[] = [
    { id: 'alle', label: 'Alle Notizen', icon: '🗂️', count: live.length },
    { id: 'angeheftet', label: 'Angeheftet', icon: '📌', count: live.filter((n) => n.pinned).length },
    ...(dailyCount ? [{ id: 'tage' as Folder, label: 'Tagesnotizen', icon: '☀️', count: dailyCount }] : []),
    ...data.courses.map((c) => ({ id: `kurs:${c.id}` as Folder, label: c.name, icon: '📁', count: live.filter((n) => n.courseId === c.id).length })),
    { id: 'ohne', label: 'Persönlich', icon: '📁', count: live.filter((n) => n.courseId === null).length },
    ...(trash.length ? [{ id: 'geloescht' as Folder, label: 'Zuletzt gelöscht', icon: '🗑️', count: trash.length }] : []),
  ];
  // Ordner verschwunden (z. B. Papierkorb geleert): zurück zu allen
  useEffect(() => {
    if (!folders.some((f) => f.id === folder)) setFolder('alle');
  });

  const createFrom = (tpl: NoteTemplate) => {
    setTemplates(false);
    const courseId = folder.startsWith('kurs:') ? folder.slice(5) : null;
    const content = tpl.content(t) + (tag ? `\n\n#${tag}` : '');
    const id = add('notes', {
      title: tpl.title(t),
      courseId,
      content,
      updated: new Date().toISOString(),
      pinned: folder === 'angeheftet',
      ...(tpl.emoji ? { icon: tpl.emoji, color: tpl.color } : {}),
    });
    freshNote = id;
    location.hash = `#/notizen/${id}`;
  };

  const openDaily = () => {
    const existing = live.find((n) => n.daily === t);
    if (existing) {
      location.hash = `#/notizen/${existing.id}`;
      return;
    }
    const events = sortEntries(entries.filter((e) => e.kind !== 'task' && e.kind !== 'project' && onDay(e, t))).map((e) => ({ time: e.time, label: e.label }));
    const id = add('notes', { title: dailyTitle(t), courseId: null, content: dailyContent(events), updated: new Date().toISOString(), daily: t, icon: '☀️', color: '#FF9500' });
    freshNote = id;
    location.hash = `#/notizen/${id}`;
  };

  const restore = (n: Note) => {
    update('notes', n.id, { deletedAt: undefined });
    show(`„${noteTitle(n)}“ wiederhergestellt`, { label: 'Öffnen', run: () => (location.hash = `#/notizen/${n.id}`) });
  };
  const purge = (n: Note) => {
    if (confirm(`„${noteTitle(n)}“ endgültig löschen? Das lässt sich nicht widerrufen.`)) remove('notes', n.id);
  };
  const emptyTrash = () => {
    if (!confirm(`${trash.length} ${trash.length === 1 ? 'Notiz' : 'Notizen'} endgültig löschen? Das lässt sich nicht widerrufen.`)) return;
    const ids = new Set(trash.map((n) => n.id));
    mutate((d) => ({
      ...d,
      notes: d.notes.filter((n) => !ids.has(n.id)),
      tasks: d.tasks.map((x) => (x.noteId && ids.has(x.noteId) ? { ...x, noteId: null, noteLine: undefined } : x)),
    }));
  };

  const row = (n: Note) => {
    const g = dateGroup(n.updated, now);
    return (
      <li key={n.id}>
        <a href={`#/notizen/${n.id}`} className={`note-row ${n.id === selected ? 'active' : ''}`}>
          <NoteIcon note={n} />
          <span className="note-row-text">
            <strong>{noteTitle(n)}</strong>
            <span><span className="note-row-time">{listTime(n.updated, g)}</span> {noteSnippet(n)}</span>
          </span>
        </a>
      </li>
    );
  };
  const card = (n: Note) => {
    const g = dateGroup(n.updated, now);
    return (
      <li key={n.id}>
        <a href={`#/notizen/${n.id}`} className={`note-card ${n.id === selected ? 'active' : ''}`} style={{ ['--c' as string]: noteColor(n) }}>
          <span className="note-card-sheet">
            <GalleryPreview note={n} />
            {n.icon && <span className="note-card-emoji" aria-hidden>{n.icon}</span>}
            {n.pinned && <Pin size={12} className="note-card-pin" aria-label="Angeheftet" />}
          </span>
          <strong>{noteTitle(n)}</strong>
          <small>{listTime(n.updated, g)}</small>
        </a>
      </li>
    );
  };
  const group = (list: Note[]) => (gallery ? <ul className="note-gallery">{list.map(card)}</ul> : <ul>{list.map(row)}</ul>);

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
              {allTags.map((x) => (
                <button key={x} type="button" className={tag === x ? 'on' : ''} onClick={() => setTag(tag === x ? null : x)}>#{x}</button>
              ))}
            </div>
          </>
        )}
      </aside>

      <section className="notes-list">
        <div className="notes-list-head">
          <input type="search" placeholder="🔍 Suchen" value={query} onChange={(e) => setQuery(e.target.value)} aria-label="Notizen durchsuchen" />
          <button type="button" className="note-head-btn" onClick={() => setGallery(!gallery)} aria-label={gallery ? 'Als Liste zeigen' : 'Als Galerie zeigen'} title={gallery ? 'Als Liste' : 'Als Galerie'}>
            {gallery ? <List size={18} /> : <LayoutGrid size={18} />}
          </button>
          <button type="button" className="note-head-btn" onClick={openDaily} aria-label="Tagesnotiz von heute" title="Tagesnotiz von heute">
            <CalendarDays size={18} />
          </button>
          <button type="button" className="note-new" onClick={() => setTemplates(true)} title="Neue Notiz" aria-label="Neue Notiz"><SquarePen size={18} /></button>
        </div>
        {tag && (
          <div className="notes-filter">
            Tag <strong>#{tag}</strong> <button type="button" className="icon" onClick={() => setTag(null)} aria-label="Tag-Filter entfernen">×</button>
          </div>
        )}
        {folder === 'geloescht' ? (
          <>
            <p className="notes-trash-hint muted small">Gelöschte Notizen bleiben 30 Tage hier, dann sind sie endgültig weg.</p>
            <ul className="notes-trash">
              {trash.map((n) => (
                <li key={n.id} className="note-row trash">
                  <NoteIcon note={n} />
                  <span className="note-row-text">
                    <strong>{noteTitle(n)}</strong>
                    <span>noch {trashDaysLeft(n.deletedAt!, now)} {trashDaysLeft(n.deletedAt!, now) === 1 ? 'Tag' : 'Tage'}</span>
                  </span>
                  <button type="button" className="icon" onClick={() => restore(n)} aria-label="Wiederherstellen" title="Wiederherstellen"><RotateCcw size={16} /></button>
                  <button type="button" className="icon danger" onClick={() => purge(n)} aria-label="Endgültig löschen" title="Endgültig löschen"><Trash2 size={16} /></button>
                </li>
              ))}
            </ul>
            {trash.length > 0 && <button type="button" className="notes-trash-empty danger" onClick={emptyTrash}>Alle endgültig löschen</button>}
          </>
        ) : notes.length === 0 ? <Empty>Keine Notizen gefunden.</Empty> : (
          <>
            {pinned.length > 0 && folder !== 'angeheftet' && (
              <>
                <h3 className="notes-group">📌 Angeheftet</h3>
                {group(pinned)}
              </>
            )}
            {GROUPS.map((g) => {
              const list = (folder === 'angeheftet' ? notes : rest).filter((n) => dateGroup(n.updated, now) === g);
              return list.length === 0 ? null : (
                <div key={g}>
                  <h3 className="notes-group">{g}</h3>
                  {group(list)}
                </div>
              );
            })}
          </>
        )}
        {folder !== 'geloescht' && <p className="notes-count muted small">{notes.length} {notes.length === 1 ? 'Notiz' : 'Notizen'}</p>}
      </section>

      <section className="notes-detail">
        {note ? (
          <Editor key={note.id} note={note} onTag={(x) => { setTag(x); setFolder('alle'); }} onBack={() => (location.hash = '#/notizen')} />
        ) : (
          <div className="notes-empty">
            <Empty>Wähle eine Notiz aus oder leg eine neue an.</Empty>
            <div className="row">
              <button type="button" className="primary" onClick={() => setTemplates(true)}><SquarePen size={15} aria-hidden /> Neue Notiz</button>
              <button type="button" onClick={openDaily}><CalendarDays size={15} aria-hidden /> Tagesnotiz</button>
            </div>
          </div>
        )}
      </section>

      {templates && (
        <Sheet title="Neue Notiz" onClose={() => setTemplates(false)}>
          <div className="note-templates">
            {NOTE_TEMPLATES.map((tpl) => {
              const Icon = TEMPLATE_ICONS[tpl.icon];
              return (
                <button key={tpl.id} type="button" onClick={() => createFrom(tpl)}>
                  <span className="note-ico" style={{ ['--c' as string]: tpl.color, width: 32, height: 32 }} aria-hidden><Icon size={17} /></span>
                  <span>{tpl.label}</span>
                </button>
              );
            })}
            <button type="button" onClick={() => { setTemplates(false); openDaily(); }}>
              <span className="note-ico" style={{ ['--c' as string]: '#FF9500', width: 32, height: 32 }} aria-hidden>☀️</span>
              <span>Tagesnotiz von heute</span>
            </button>
          </div>
        </Sheet>
      )}
    </div>
  );
}
