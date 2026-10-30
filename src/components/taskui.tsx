import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Archive, Bell, CalendarDays, Check, Flag, Moon, Play, Repeat, Star, Sun, Tag, Timer, Trash2, X } from 'lucide-react';
import { newId, useStore } from '../store';
import type { ID, Priority, Subtask, Task, TaskKind, TaskRepeat, TaskStatus } from '../types';
import { addDays, formatDate, today } from '../lib/dates';
import { describeTaskRepeat, dropPatch, formatMinutes, parseTags, WEEKDAY_SHORT } from '../lib/tasks';
import { setWhen, whenOf, type When } from '../lib/things';
import { useFocus } from './focus';
import { useToast } from './toast';

export const KINDS: TaskKind[] = ['Aufgabe', 'Lektüre', 'Projekt', 'Bewerbung'];
export const STATUSES: TaskStatus[] = ['offen', 'in Arbeit', 'erledigt'];
const PRIORITIES: { id: Priority; label: string }[] = [
  { id: 'niedrig', label: 'Niedrig' },
  { id: 'mittel', label: 'Normal' },
  { id: 'hoch', label: 'Hoch' },
];
const ESTIMATES = [15, 30, 45, 60, 90, 120, 180];

/* ---------- Gemeinsamer Zustand: Detailpanel und Auswahl ---------- */

interface TaskUI {
  openId: ID | null;
  open(id: ID): void;
  close(): void;
  selected: Set<ID>;
  /** Am Handy: „Auswählen“ ist an, Tippen wählt statt zu öffnen */
  selectMode: boolean;
  setSelectMode(on: boolean): void;
  /** Aufgabe, auf der die Tastatur gerade steht */
  cursor: ID | null;
  setCursor(id: ID | null): void;
  select(id: ID, how: 'only' | 'toggle' | 'range'): void;
  setSelected(ids: ID[]): void;
  clearSelection(): void;
}

const Ctx = createContext<TaskUI | null>(null);

/** Sichtbare Aufgaben in Bildschirm-Reihenfolge */
export const visibleTaskIds = (): ID[] =>
  [...document.querySelectorAll<HTMLElement>('[data-task-id]')].map((el) => el.dataset.taskId!).filter((id, i, all) => all.indexOf(id) === i);

export function TaskUIProvider({ children }: { children: ReactNode }) {
  const { data } = useStore();
  const [openId, setOpenId] = useState<ID | null>(null);
  const [selected, setSel] = useState<Set<ID>>(new Set());
  const [selectMode, setSelectMode] = useState(false);
  const [cursor, setCursor] = useState<ID | null>(null);

  const select = useCallback((id: ID, how: 'only' | 'toggle' | 'range') => {
    setSel((prev) => {
      if (how === 'only') return new Set([id]);
      if (how === 'toggle') {
        const next = new Set(prev);
        if (next.has(id)) next.delete(id);
        else next.add(id);
        return next;
      }
      const ids = visibleTaskIds();
      const anchor = [...prev].pop() ?? id;
      const [a, b] = [ids.indexOf(anchor), ids.indexOf(id)].sort((x, y) => x - y);
      return new Set([...prev, ...(a >= 0 ? ids.slice(a, b + 1) : [id])]);
    });
    setCursor(id);
  }, []);

  const value = useMemo<TaskUI>(() => ({
    openId,
    open: (id) => {
      setOpenId(id);
      setCursor(id);
    },
    close: () => setOpenId(null),
    selected,
    selectMode,
    setSelectMode: (on) => {
      setSelectMode(on);
      if (!on) setSel(new Set());
    },
    cursor,
    setCursor,
    select,
    setSelected: (ids) => setSel(new Set(ids)),
    clearSelection: () => setSel(new Set()),
  }), [openId, selected, selectMode, cursor, select]);

  // Seitenwechsel: Panel und Auswahl zurücksetzen
  useEffect(() => {
    const reset = () => {
      setOpenId(null);
      setSel(new Set());
      setSelectMode(false);
    };
    window.addEventListener('hashchange', reset);
    return () => window.removeEventListener('hashchange', reset);
  }, []);

  const task = data.tasks.find((t) => t.id === openId);
  // Gelöschte Aufgabe: Panel schließen
  useEffect(() => {
    if (openId && !task) setOpenId(null);
  }, [openId, task]);

  return (
    <Ctx.Provider value={value}>
      {children}
      {task && <TaskInspector key={task.id} task={task} onClose={() => setOpenId(null)} />}
    </Ctx.Provider>
  );
}

export function useTaskUI(): TaskUI {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useTaskUI außerhalb des TaskUIProvider');
  return ctx;
}

/* ---------- Aktionen für eine oder mehrere Aufgaben (mit Widerrufen) ---------- */

export function useTaskActions() {
  const { data, update, mutate } = useStore();
  const toast = useToast();
  const focus = useFocus();
  const t = today();
  const find = (ids: ID[]) => data.tasks.filter((x) => ids.includes(x.id));
  const count = (n: number, one: string, many: string) => (n === 1 ? one : `${n} ${many}`);

  /** Änderungen mit „Widerrufen“: alte Werte werden zurückgeschrieben */
  const patchAll = (ids: ID[], patch: (task: Task) => Partial<Task>, message: string) => {
    const tasks = find(ids);
    if (!tasks.length) return;
    const before = tasks.map((task) => {
      const p = patch(task);
      const old = Object.fromEntries(Object.keys(p).map((k) => [k, task[k as keyof Task]])) as Partial<Task>;
      update('tasks', task.id, p);
      return { id: task.id, old };
    });
    toast.show(message, { label: 'Widerrufen', run: () => before.forEach((b) => update('tasks', b.id, b.old)) });
  };

  return {
    complete: (ids: ID[]) => {
      const open = find(ids).filter((x) => x.status !== 'erledigt');
      patchAll(open.map((x) => x.id), () => ({ status: 'erledigt' }), open.length === 1 ? `„${open[0].title}“ erledigt` : `${open.length} Aufgaben erledigt`);
    },
    reopen: (ids: ID[]) => ids.forEach((id) => update('tasks', id, { status: 'offen' })),
    when: (ids: ID[], when: When, date?: string) =>
      patchAll(ids, () => setWhen(when, t, date), count(ids.length, 'Verschoben', 'Aufgaben verschoben')),
    /** Auf morgen: überfällige Fristen wandern mit, sonst wird für morgen eingeplant */
    tomorrow: (ids: ID[]) =>
      patchAll(ids, (task) => (task.due && task.due <= t ? { due: addDays(t, 1), plannedFor: null, someday: false } : setWhen('morgen', t)), count(ids.length, 'Auf morgen verschoben', 'Aufgaben auf morgen verschoben')),
    due: (ids: ID[], date: string | null) => patchAll(ids, () => ({ due: date }), date ? `Frist: ${formatDate(date)}` : 'Frist entfernt'),
    move: (ids: ID[], target: string) => {
      const p = dropPatch(target, t);
      if (p) patchAll(ids, () => p, count(ids.length, 'Verschoben', 'Aufgaben verschoben'));
    },
    flag: (ids: ID[]) => {
      const tasks = find(ids);
      const on = tasks.some((x) => !x.flagged);
      patchAll(ids, () => ({ flagged: on }), on ? 'Markiert' : 'Markierung entfernt');
    },
    remove: (ids: ID[]) => {
      const tasks = find(ids);
      if (!tasks.length) return;
      mutate((d) => ({ ...d, tasks: d.tasks.filter((x) => !ids.includes(x.id)) }));
      toast.show(tasks.length === 1 ? `„${tasks[0].title}“ gelöscht` : `${tasks.length} Aufgaben gelöscht`, {
        label: 'Widerrufen',
        run: () => mutate((d) => ({ ...d, tasks: [...d.tasks, ...tasks.filter((x) => !d.tasks.some((y) => y.id === x.id))] })),
      });
    },
    startFocus: (task: Task) => {
      if (focus.timer.active) {
        toast.show('Es läuft schon ein Fokus-Timer');
      } else {
        focus.configure({ taskId: task.id, courseId: task.courseId });
        focus.start();
      }
      location.hash = '#/fokus';
    },
  };
}

/* ---------- Kleine Symbole ---------- */

export function WhenIcon({ when, size = 14 }: { when: When; size?: number }) {
  if (when === 'heute') return <Star size={size} aria-hidden className="ico-today" />;
  if (when === 'abends') return <Moon size={size} aria-hidden className="ico-evening" />;
  if (when === 'irgendwann') return <Archive size={size} aria-hidden />;
  if (when === 'morgen') return <Sun size={size} aria-hidden />;
  return <CalendarDays size={size} aria-hidden />;
}

/* ---------- Detailpanel ---------- */

const REPEAT_OPTIONS: { id: TaskRepeat['freq'] | ''; label: string }[] = [
  { id: '', label: 'Nie' },
  { id: 'taeglich', label: 'Täglich / alle n Tage' },
  { id: 'werktags', label: 'Werktags' },
  { id: 'woechentlich', label: 'Wöchentlich' },
  { id: 'zweiwoechentlich', label: 'Alle 2 Wochen' },
  { id: 'monatlich', label: 'Monatlich' },
  { id: 'jaehrlich', label: 'Jährlich' },
];

const WHEN_OPTIONS: { id: When; label: string }[] = [
  { id: '', label: 'Ohne' },
  { id: 'heute', label: 'Heute' },
  { id: 'abends', label: 'Heute Abend' },
  { id: 'morgen', label: 'Morgen' },
  { id: 'datum', label: 'An einem Tag …' },
  { id: 'irgendwann', label: 'Irgendwann' },
];

/**
 * Details einer Aufgabe – am Computer als Panel rechts, am Handy als Blatt von unten.
 * Jede Änderung wird sofort gespeichert.
 */
function TaskInspector({ task, onClose }: { task: Task; onClose: () => void }) {
  const { data, update } = useStore();
  const actions = useTaskActions();
  const t = today();
  const [title, setTitle] = useState(task.title);
  const [newSub, setNewSub] = useState('');
  const [newTag, setNewTag] = useState('');
  const set = (patch: Partial<Task>) => update('tasks', task.id, patch);
  const subs = task.subtasks ?? [];
  const setSubs = (next: Subtask[]) => set({ subtasks: next });
  const when = whenOf(task, t);
  const project = data.projects.find((p) => p.id === task.projectId);
  const listValue = task.listId ? `list:${task.listId}` : task.courseId ? `course:${task.courseId}` : 'course:';

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
      }
    };
    window.addEventListener('keydown', onKey);
    document.body.classList.add('has-inspector');
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.classList.remove('has-inspector');
    };
  }, [onClose]);

  const addSub = () => {
    if (newSub.trim()) setSubs([...subs, { id: newId(), title: newSub.trim(), done: false }]);
    setNewSub('');
  };
  const addTags = () => {
    const tags = parseTags(newTag);
    if (tags.length) set({ tags: [...new Set([...(task.tags ?? []), ...tags])] });
    setNewTag('');
  };
  const setRepeat = (patch: Partial<TaskRepeat> | null) => set({ repeat: patch === null ? null : { ...(task.repeat ?? { freq: 'woechentlich' }), ...patch } });

  return createPortal(
    <>
      <div className="inspector-backdrop" onMouseDown={onClose} aria-hidden />
      <aside className="inspector" role="dialog" aria-label="Aufgabe bearbeiten">
        <div className="inspector-head">
          <button
            type="button"
            className={`rem-check ${task.status === 'erledigt' ? 'on' : ''}`}
            onClick={() => (task.status === 'erledigt' ? actions.reopen([task.id]) : actions.complete([task.id]))}
            aria-label={task.status === 'erledigt' ? 'Wieder öffnen' : 'Erledigen'}
            aria-pressed={task.status === 'erledigt'}
          >
            {task.status === 'erledigt' && <Check size={13} strokeWidth={3.5} color="#fff" aria-hidden />}
          </button>
          <input
            className="inspector-title"
            value={title}
            onChange={(e) => {
              setTitle(e.target.value);
              if (e.target.value.trim()) set({ title: e.target.value });
            }}
            onBlur={() => !title.trim() && setTitle(task.title)}
            aria-label="Titel"
          />
          <button type="button" className="icon" onClick={onClose} aria-label="Schließen"><X size={18} /></button>
        </div>
        <textarea className="inspector-note" rows={2} value={task.note ?? ''} onChange={(e) => set({ note: e.target.value })} placeholder="Notiz hinzufügen …" aria-label="Notiz" />

        <div className="inspector-subs">
          {subs.map((s) => (
            <div key={s.id} className="sub-row">
              <input type="checkbox" checked={s.done} onChange={() => setSubs(subs.map((x) => (x.id === s.id ? { ...x, done: !x.done } : x)))} aria-label={`${s.title} erledigt`} />
              <input className="grow plain" value={s.title} onChange={(e) => setSubs(subs.map((x) => (x.id === s.id ? { ...x, title: e.target.value } : x)))} aria-label="Unteraufgabe" />
              <button type="button" className="icon" onClick={() => setSubs(subs.filter((x) => x.id !== s.id))} aria-label="Unteraufgabe entfernen"><X size={14} /></button>
            </div>
          ))}
          <input
            className="plain"
            placeholder="+ Unteraufgabe"
            value={newSub}
            onChange={(e) => setNewSub(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addSub())}
            onBlur={addSub}
            aria-label="Neue Unteraufgabe"
          />
        </div>

        <div className="inspector-card">
          <label className="inspector-row">
            <span><WhenIcon when={when} /> Wann</span>
            <select value={when} onChange={(e) => set(setWhen(e.target.value as When, t, task.plannedFor ?? undefined))}>
              {WHEN_OPTIONS.map((w) => <option key={w.id || 'ohne'} value={w.id}>{w.label}</option>)}
            </select>
          </label>
          {(when === 'datum' || when === 'morgen') && (
            <label className="inspector-row sub">
              <span>Eingeplant für</span>
              <input type="date" min={addDays(t, 1)} value={task.plannedFor ?? ''} onChange={(e) => e.target.value && set(setWhen('datum', t, e.target.value))} />
            </label>
          )}
          <label className="inspector-row">
            <span><CalendarDays size={14} aria-hidden /> Frist</span>
            <span className="row">
              <input type="date" value={task.due ?? ''} onChange={(e) => set({ due: e.target.value || null, ...(e.target.value ? {} : { dueTime: '', remind: false }) })} />
              {task.due && <input type="time" value={task.dueTime ?? ''} onChange={(e) => set({ dueTime: e.target.value })} aria-label="Uhrzeit" />}
            </span>
          </label>
          <label className="inspector-row">
            <span><Repeat size={14} aria-hidden /> Wiederholen</span>
            <select value={task.repeat?.freq ?? ''} onChange={(e) => setRepeat(e.target.value ? { freq: e.target.value as TaskRepeat['freq'] } : null)}>
              {REPEAT_OPTIONS.map((r) => <option key={r.id || 'nie'} value={r.id}>{r.label}</option>)}
            </select>
          </label>
          {task.repeat && (
            <div className="inspector-row sub col">
              {task.repeat.freq === 'taeglich' && (
                <label className="row">
                  Alle
                  <input type="number" className="narrow" min={1} max={365} value={task.repeat.interval ?? 1} onChange={(e) => setRepeat({ interval: Math.max(1, Number(e.target.value) || 1) })} />
                  Tage
                </label>
              )}
              {task.repeat.freq === 'woechentlich' && (
                <div className="weekday-picker" role="group" aria-label="Wochentage">
                  {WEEKDAY_SHORT.map((d, i) => {
                    const on = task.repeat!.days?.includes(i + 1) ?? false;
                    return (
                      <button
                        key={d}
                        type="button"
                        className={on ? 'on' : ''}
                        aria-pressed={on}
                        onClick={() => {
                          const days = task.repeat!.days ?? [];
                          setRepeat({ days: on ? days.filter((x) => x !== i + 1) : [...days, i + 1].sort() });
                        }}
                      >
                        {d}
                      </button>
                    );
                  })}
                </div>
              )}
              <label className="check small">
                <input type="checkbox" checked={!!task.repeat.afterDone} onChange={(e) => setRepeat({ afterDone: e.target.checked })} />
                Ab Erledigung zählen statt ab Fälligkeit
              </label>
              <span className="muted small">{describeTaskRepeat(task.repeat, task.due ?? task.plannedFor ?? null)} – beim Abhaken erscheint die nächste.</span>
            </div>
          )}
          <label className="inspector-row">
            <span>Liste</span>
            <select value={listValue} onChange={(e) => set(dropPatch(e.target.value, t) ?? {})}>
              <option value="course:">Ohne Liste</option>
              {data.courses.length > 0 && (
                <optgroup label="Studium">
                  {data.courses.map((c) => <option key={c.id} value={`course:${c.id}`}>{c.name}</option>)}
                </optgroup>
              )}
              {data.taskLists.length > 0 && (
                <optgroup label="Meine Listen">
                  {data.taskLists.map((l) => <option key={l.id} value={`list:${l.id}`}>{l.name}</option>)}
                </optgroup>
              )}
            </select>
          </label>
          <label className="inspector-row">
            <span>Projekt</span>
            <select value={task.projectId ?? ''} onChange={(e) => set({ projectId: e.target.value || null, section: undefined })}>
              <option value="">Kein Projekt</option>
              {data.projects.map((p) => <option key={p.id} value={p.id}>{p.title}</option>)}
            </select>
          </label>
          {(project?.sections?.length ?? 0) > 0 && (
            <label className="inspector-row sub">
              <span>Abschnitt</span>
              <select value={task.section ?? ''} onChange={(e) => set({ section: e.target.value || undefined })}>
                <option value="">Ohne Abschnitt</option>
                {project!.sections!.map((s) => <option key={s}>{s}</option>)}
              </select>
            </label>
          )}
          <div className="inspector-row">
            <span>Priorität</span>
            <div className="segmented small" role="radiogroup" aria-label="Priorität">
              {PRIORITIES.map((p) => (
                <button key={p.id} type="button" role="radio" aria-checked={task.priority === p.id} className={task.priority === p.id ? 'selected' : ''} onClick={() => set({ priority: p.id })}>{p.label}</button>
              ))}
            </div>
          </div>
        </div>

        <div className="inspector-card">
          <div className="inspector-row col">
            <span><Timer size={14} aria-hidden /> Aufwand{task.spent ? <span className="muted"> · bisher {formatMinutes(task.spent)} gearbeitet</span> : null}</span>
            <div className="chip-row">
              {ESTIMATES.map((m) => (
                <button key={m} type="button" className={`tchip ${task.estimate === m ? 'on' : ''}`} aria-pressed={task.estimate === m} onClick={() => set({ estimate: task.estimate === m ? undefined : m })}>
                  {formatMinutes(m).replace(' 0 min', '')}
                </button>
              ))}
            </div>
            {task.status !== 'erledigt' && (
              <button type="button" className="focus-start" onClick={() => actions.startFocus(task)}><Play size={13} fill="currentColor" aria-hidden /> Fokus starten</button>
            )}
          </div>
        </div>

        <div className="inspector-card">
          <div className="inspector-row col">
            <span><Tag size={14} aria-hidden /> Tags</span>
            <div className="chip-row">
              {(task.tags ?? []).map((tag) => (
                <span key={tag} className="tchip on">
                  @{tag}
                  <button type="button" className="tchip-x" onClick={() => set({ tags: task.tags!.filter((x) => x !== tag) })} aria-label={`Tag ${tag} entfernen`}><X size={12} /></button>
                </span>
              ))}
              <input
                className="plain tag-input"
                placeholder="Tag hinzufügen …"
                value={newTag}
                onChange={(e) => setNewTag(e.target.value)}
                onKeyDown={(e) => (e.key === 'Enter' || e.key === ',') && (e.preventDefault(), addTags())}
                onBlur={addTags}
                aria-label="Neuer Tag"
              />
            </div>
          </div>
        </div>

        <details className="inspector-card inspector-more">
          <summary>Mehr: Art, Status, Erinnerung</summary>
          <label className="inspector-row">
            <span>Art</span>
            <select value={task.kind} onChange={(e) => set({ kind: e.target.value as TaskKind })}>
              {KINDS.map((k) => <option key={k}>{k}</option>)}
            </select>
          </label>
          <label className="inspector-row">
            <span>Status</span>
            <select value={task.status} onChange={(e) => set({ status: e.target.value as TaskStatus })}>
              {STATUSES.map((s) => <option key={s}>{s}</option>)}
            </select>
          </label>
          <label className="inspector-row">
            <span><Flag size={14} aria-hidden /> Markiert</span>
            <input type="checkbox" checked={!!task.flagged} onChange={(e) => set({ flagged: e.target.checked })} />
          </label>
          <label className="inspector-row">
            <span><Bell size={14} aria-hidden /> Zur Uhrzeit erinnern</span>
            <input type="checkbox" checked={!!task.remind} onChange={(e) => set({ remind: e.target.checked })} disabled={!task.due || !task.dueTime} />
          </label>
        </details>

        <div className="inspector-foot">
          <button type="button" className="danger" onClick={() => actions.remove([task.id])}><Trash2 size={14} aria-hidden /> Löschen</button>
          <span className="muted small"><Check size={13} aria-hidden /> Automatisch gespeichert</span>
        </div>
      </aside>
    </>,
    document.body,
  );
}
