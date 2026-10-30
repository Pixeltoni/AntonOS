import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { Archive, Bell, CalendarDays, Check, ChevronRight, Flag, GripVertical, Moon, Play, Repeat, Sun, Timer, Trash2 } from 'lucide-react';
import { useStore } from '../store';
import type { ID, Task } from '../types';
import { formatDate, parseDate, relativeLabel, today } from '../lib/dates';
import { parseQuickAdd } from '../lib/quickadd';
import { describeTaskRepeat, dropPatch, formatMinutes, moveId, sortTasks } from '../lib/tasks';
import { whenOf } from '../lib/things';
import { useTaskActions, useTaskUI } from './taskui';

export { KINDS, STATUSES } from './taskui';
export { sortTasks } from '../lib/tasks';

/** Erledigt markieren – mit „Widerrufen“ statt Nachfrage. */
export function useCompleteTask() {
  const actions = useTaskActions();
  return (task: Task) => actions.complete([task.id]);
}

const cap = (s: string) => s.replace(/^./, (c) => c.toUpperCase());
/** „Mo., 2. Nov.“ */
const shortDate = (d: string) => parseDate(d).toLocaleDateString('de-DE', { weekday: 'short', day: 'numeric', month: 'short' });

/**
 * Schnelleingabe in natürlicher Sprache: „Übungsblatt morgen 10 Uhr !!! #analysis“.
 * Erkanntes wird als Chips angezeigt, bevor die Aufgabe angelegt wird.
 */
export function TaskForm({
  courseId = null,
  projectId = null,
  defaults = {},
  compact = false,
  placeholder,
}: {
  courseId?: ID | null;
  projectId?: ID | null;
  defaults?: Partial<Pick<Task, 'flagged' | 'due' | 'plannedFor' | 'evening' | 'someday' | 'section' | 'listId'>>;
  compact?: boolean;
  placeholder?: string;
}) {
  const { data, add } = useStore();
  const [text, setText] = useState('');
  const t = today();
  const parsed = parseQuickAdd(text, t, data.courses, data.taskLists);
  const course = data.courses.find((c) => c.id === (parsed.courseId ?? courseId));
  const list = data.taskLists.find((l) => l.id === parsed.listId);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!parsed.title) return;
    const listId = parsed.listId ?? (parsed.courseId ? null : defaults.listId ?? null);
    add('tasks', {
      title: parsed.title,
      courseId: parsed.listId ? null : parsed.courseId ?? courseId,
      projectId,
      listId,
      due: parsed.due ?? defaults.due ?? null,
      dueTime: parsed.dueTime,
      kind: 'Aufgabe',
      priority: parsed.priority ?? 'mittel',
      status: 'offen',
      note: '',
      flagged: defaults.flagged ?? false,
      subtasks: [],
      // „heute abend“ / „irgendwann“ aus dem Text haben Vorrang vor der Liste
      plannedFor: parsed.evening ? t : parsed.someday ? null : parsed.repeatStart ?? defaults.plannedFor ?? null,
      evening: parsed.evening || (!parsed.someday && !!defaults.evening),
      someday: parsed.someday || (!parsed.evening && !!defaults.someday),
      ...(defaults.section ? { section: defaults.section } : {}),
      ...(parsed.repeat ? { repeat: parsed.repeat } : {}),
      ...(parsed.tags.length ? { tags: parsed.tags } : {}),
      ...(parsed.estimate ? { estimate: parsed.estimate } : {}),
    });
    setText('');
  };

  const chips = [
    parsed.due && { icon: <CalendarDays size={12} />, text: `${cap(relativeLabel(parsed.due, t))}${parsed.dueTime ? `, ${parsed.dueTime}` : ''}` },
    parsed.evening && { icon: <Moon size={12} />, text: 'Heute Abend' },
    parsed.someday && { icon: <Archive size={12} />, text: 'Irgendwann' },
    parsed.repeat && { icon: <Repeat size={12} />, text: describeTaskRepeat(parsed.repeat, parsed.due ?? parsed.repeatStart) },
    parsed.priority && { icon: null, text: `Priorität ${parsed.priority}` },
    parsed.courseId && course && { icon: null, text: course.name },
    list && { icon: null, text: list.name },
    parsed.estimate && { icon: <Timer size={12} />, text: formatMinutes(parsed.estimate) },
    ...parsed.tags.map((tag) => ({ icon: null, text: `@${tag}` })),
  ].filter(Boolean) as { icon: React.ReactNode; text: string }[];

  return (
    <form className={`quick-add ${compact ? 'compact' : ''}`} onSubmit={submit}>
      <div className="quick-add-row">
        <button type="submit" className="qa-plus" aria-label="Aufgabe hinzufügen" disabled={!parsed.title}>+</button>
        <input
          className="grow"
          placeholder={placeholder ?? (compact ? 'Neue Aufgabe …' : 'Neue Aufgabe, z. B. „Wäsche jeden Sonntag ~30m @zuhause“')}
          value={text}
          onChange={(e) => setText(e.target.value)}
          aria-label="Titel der Aufgabe"
        />
      </div>
      {chips.length > 0 && (
        <div className="qa-chips" aria-label="Erkannt">
          {chips.map((c) => <span key={c.text} className="qa-chip">{c.icon}{c.text}</span>)}
        </div>
      )}
    </form>
  );
}

/** Leere Liste mit kleiner Illustration */
export function TaskEmpty({ text = 'Keine Aufgaben – genieß die freie Zeit.' }: { text?: string }) {
  return (
    <div className="task-empty">
      <svg width="64" height="64" viewBox="0 0 64 64" aria-hidden="true">
        <circle cx="32" cy="32" r="22" fill="var(--accent-soft)" />
        <path d="M22 32.5l7 7 13-14" fill="none" stroke="var(--accent)" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M52 12v6M49 15h6M10 46v4M8 48h4M54 44l2 2M56 44l-2 2" stroke="var(--muted)" strokeWidth="1.8" strokeLinecap="round" />
      </svg>
      <span>{text}</span>
    </div>
  );
}

interface Gesture {
  id: ID;
  index: number;
  pointerId: number;
  pointerType: string;
  x0: number;
  y0: number;
  mode: 'pending' | 'swipe' | 'drag';
  timer?: number;
  mids: number[];
  dx: number;
  over: number;
  drop: HTMLElement | null;
}

/** Ab dieser Strecke (px) löst Wischen aus */
const SWIPE_DONE = 90;
const SWIPE_OPEN = 70;
const ACTIONS_WIDTH = 216;

/**
 * Aufgabenliste im Stil von Apple Erinnerungen: runder Haken in Listenfarbe,
 * Erledigen mit „Widerrufen“, Antippen öffnet die Details.
 * Am Handy: nach rechts wischen = erledigt, nach links = Aktionen, gedrückt halten = verschieben.
 * Am Computer: am Griff ziehen – auch auf Listen in der Seitenleiste.
 */
export function TaskList({ tasks, showCourse = true, compact = false, sortable = true, emptyText }: {
  tasks: Task[];
  showCourse?: boolean;
  compact?: boolean;
  /** Eigene Reihenfolge per Ziehen erlauben */
  sortable?: boolean;
  emptyText?: string;
}) {
  const { data, update, mutate } = useStore();
  const ui = useTaskUI();
  const actions = useTaskActions();
  const t = today();
  const [expanded, setExpanded] = useState<Set<ID>>(new Set());
  const [renaming, setRenaming] = useState<ID | null>(null);
  const [drag, setDrag] = useState<{ id: ID; dy: number; over: number; dropping: boolean } | null>(null);
  const [swipe, setSwipe] = useState<{ id: ID; dx: number } | null>(null);
  const [swipeOpen, setSwipeOpen] = useState<ID | null>(null);
  const gesture = useRef<Gesture | null>(null);
  const suppressClick = useRef(false);
  const listRef = useRef<HTMLUListElement>(null);
  const sorted = sortTasks(tasks);
  const sortedIds = sorted.map((x) => x.id);
  const idsRef = useRef(sortedIds);
  idsRef.current = sortedIds;
  const latest = useRef({ actions, mutate });
  latest.current = { actions, mutate };

  // Bewegungen laufen über das ganze Fenster, damit nichts verloren geht
  useEffect(() => {
    const clearDrop = (g: Gesture) => {
      g.drop?.classList.remove('drop-over');
      g.drop = null;
    };
    const end = (e: PointerEvent, cancelled: boolean) => {
      const g = gesture.current;
      if (!g || e.pointerId !== g.pointerId) return;
      clearTimeout(g.timer);
      gesture.current = null;
      const { actions: act, mutate: mut } = latest.current;
      if (g.mode === 'drag') {
        suppressClick.current = true;
        const target = g.drop?.dataset.drop;
        clearDrop(g);
        if (!cancelled && target) act.move([g.id], target);
        else if (!cancelled && sortable && g.over !== g.index) {
          const order = moveId(idsRef.current, g.id, g.over);
          mut((d) => ({ ...d, tasks: d.tasks.map((x) => (order.includes(x.id) ? { ...x, order: order.indexOf(x.id) } : x)) }));
        }
        setDrag(null);
        document.body.classList.remove('task-dragging');
      } else if (g.mode === 'swipe') {
        suppressClick.current = true;
        if (!cancelled && g.dx > SWIPE_DONE) act.complete([g.id]);
        else if (!cancelled && g.dx < -SWIPE_OPEN) setSwipeOpen(g.id);
        setSwipe(null);
      }
    };
    const move = (e: PointerEvent) => {
      const g = gesture.current;
      if (!g || e.pointerId !== g.pointerId) return;
      const dx = e.clientX - g.x0;
      const dy = e.clientY - g.y0;
      if (g.mode === 'pending') {
        if (Math.abs(dx) < 10 && Math.abs(dy) < 10) return;
        clearTimeout(g.timer);
        // Waagerecht mit dem Finger: wischen; sonst scrollt die Seite ganz normal
        if (g.pointerType !== 'mouse' && !compact && Math.abs(dx) > Math.abs(dy)) g.mode = 'swipe';
        else {
          gesture.current = null;
          return;
        }
      }
      if (g.mode === 'swipe') {
        g.dx = dx;
        setSwipe({ id: g.id, dx: Math.max(-ACTIONS_WIDTH - 20, Math.min(160, dx)) });
        return;
      }
      // Ziehen: Ablageziel (Liste in der Seitenleiste, Tag) oder neue Position
      const under = document.elementFromPoint(e.clientX, e.clientY)?.closest<HTMLElement>('[data-drop]') ?? null;
      if (under !== g.drop) {
        g.drop?.classList.remove('drop-over');
        under?.classList.add('drop-over');
        g.drop = under;
      }
      const mids = g.mids.filter((_, i) => i !== g.index);
      g.over = mids.filter((m) => m < e.clientY).length;
      setDrag({ id: g.id, dy, over: g.over, dropping: !!under });
    };
    const up = (e: PointerEvent) => end(e, false);
    const cancel = (e: PointerEvent) => end(e, true);
    // Beim Ziehen mit dem Finger nicht gleichzeitig scrollen
    const touchMove = (e: TouchEvent) => {
      if (gesture.current?.mode === 'drag' || gesture.current?.mode === 'swipe') e.preventDefault();
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', cancel);
    window.addEventListener('touchmove', touchMove, { passive: false });
    return () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', cancel);
      window.removeEventListener('touchmove', touchMove);
    };
  }, [compact, sortable]);

  // Offene Wisch-Aktionen schließen, sobald woanders getippt wird
  useEffect(() => {
    if (!swipeOpen) return;
    const close = (e: PointerEvent) => {
      if ((e.target as HTMLElement | null)?.closest('.rem-actions')) return;
      if (!listRef.current?.contains(e.target as Node)) setSwipeOpen(null);
    };
    document.addEventListener('pointerdown', close, true);
    return () => document.removeEventListener('pointerdown', close, true);
  }, [swipeOpen]);

  if (tasks.length === 0) return <TaskEmpty text={emptyText ?? (compact ? 'Alles erledigt.' : undefined)} />;

  const startDrag = (g: Gesture) => {
    const rows = [...(listRef.current?.querySelectorAll<HTMLElement>(':scope > .rem-row') ?? [])];
    g.mids = rows.map((r) => {
      const b = r.getBoundingClientRect();
      return b.top + b.height / 2;
    });
    g.mode = 'drag';
    g.over = g.index;
    setSwipeOpen(null);
    setDrag({ id: g.id, dy: 0, over: g.index, dropping: false });
    document.body.classList.add('task-dragging');
    navigator.vibrate?.(10);
  };

  const onPointerDown = (e: ReactPointerEvent<HTMLLIElement>, task: Task, index: number) => {
    const target = e.target as HTMLElement;
    suppressClick.current = false;
    if (swipeOpen && !target.closest('.rem-actions')) {
      setSwipeOpen(null);
      suppressClick.current = true;
      return;
    }
    if (e.button !== 0 || renaming === task.id) return;
    const handle = target.closest('.rem-grip');
    if (!handle && (e.pointerType === 'mouse' || target.closest('.rem-check, .rem-flag, .rem-focus, .rem-expand, .rem-actions, .rem-subs, input'))) return;
    const g: Gesture = { id: task.id, index, pointerId: e.pointerId, pointerType: e.pointerType, x0: e.clientX, y0: e.clientY, mode: 'pending', mids: [], dx: 0, over: index, drop: null };
    gesture.current = g;
    if (handle) {
      e.preventDefault();
      startDrag(g);
    } else if (!compact) {
      g.timer = window.setTimeout(() => gesture.current === g && g.mode === 'pending' && startDrag(g), 380);
    }
  };

  const onRowClick = (e: React.MouseEvent, task: Task) => {
    if (suppressClick.current) {
      suppressClick.current = false;
      return;
    }
    if (ui.selectMode || e.metaKey || e.ctrlKey) ui.select(task.id, 'toggle');
    else if (e.shiftKey) ui.select(task.id, 'range');
    else {
      ui.clearSelection();
      ui.open(task.id);
    }
  };

  const others = drag ? sortedIds.filter((id) => id !== drag.id) : [];
  const dropBefore = drag && !drag.dropping && sortable ? others[drag.over] : undefined;
  const dropAfter = drag && !drag.dropping && sortable && drag.over >= others.length ? others[others.length - 1] : undefined;

  return (
    <ul ref={listRef} className={`rem-list ${compact ? 'compact' : ''}`}>
      {sorted.map((task, index) => {
        const done = task.status === 'erledigt';
        const overdue = !done && task.due !== null && task.due < t;
        const course = data.courses.find((c) => c.id === task.courseId);
        const list = data.taskLists.find((l) => l.id === task.listId);
        const color = course?.color ?? list?.color;
        const subs = task.subtasks ?? [];
        const subsDone = subs.filter((s) => s.done).length;
        const when = whenOf(task, t);
        const isOpen = expanded.has(task.id);
        const dx = swipe?.id === task.id ? swipe.dx : swipeOpen === task.id ? -ACTIONS_WIDTH : 0;
        const dragging = drag?.id === task.id;
        const cls = [
          'rem-row',
          done && 'done',
          ui.selected.has(task.id) && 'selected',
          ui.cursor === task.id && 'cursor',
          dragging && 'dragging',
          dropBefore === task.id && 'drop-before',
          dropAfter === task.id && 'drop-after',
          dx !== 0 && 'swiping',
        ].filter(Boolean).join(' ');
        return (
          <li
            key={task.id}
            data-task-id={task.id}
            className={cls}
            style={{ ...(color ? { ['--c' as string]: color, ['--ring' as string]: color } : {}), ...(dragging ? { transform: `translateY(${drag!.dy}px)` } : {}) }}
            onPointerDown={(e) => onPointerDown(e, task, index)}
          >
            {dx !== 0 && (
              <div className="rem-swipe-bg" aria-hidden={dx > 0}>
                {dx > 0 ? (
                  <span className={`rem-swipe-done ${dx > SWIPE_DONE ? 'armed' : ''}`}><Check size={18} strokeWidth={3} /> Erledigt</span>
                ) : (
                  <span className="rem-actions">
                    <button type="button" className="act-tomorrow" onClick={() => { setSwipeOpen(null); actions.tomorrow([task.id]); }}><Sun size={16} /> Morgen</button>
                    <button type="button" className="act-flag" onClick={() => { setSwipeOpen(null); actions.flag([task.id]); }}><Flag size={16} /> {task.flagged ? 'Lösen' : 'Markieren'}</button>
                    <button type="button" className="act-delete" onClick={() => { setSwipeOpen(null); actions.remove([task.id]); }}><Trash2 size={16} /> Löschen</button>
                  </span>
                )}
              </div>
            )}
            <div className="rem-row-inner" style={dx ? { transform: `translateX(${dx}px)` } : undefined}>
              <button
                type="button"
                className={`rem-check ${done ? 'on' : ''}`}
                onClick={() => (done ? actions.reopen([task.id]) : actions.complete([task.id]))}
                aria-label={done ? `${task.title} wieder öffnen` : `${task.title} erledigen`}
                aria-pressed={done}
              >
                {done && <Check size={12} strokeWidth={3.5} color="#fff" aria-hidden />}
              </button>
              {renaming === task.id ? (
                <input
                  className="rem-rename"
                  autoFocus
                  defaultValue={task.title}
                  aria-label="Titel"
                  onBlur={(e) => {
                    if (e.target.value.trim()) update('tasks', task.id, { title: e.target.value.trim() });
                    setRenaming(null);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
                    if (e.key === 'Escape') setRenaming(null);
                  }}
                />
              ) : (
                <button type="button" className="rem-main" onClick={(e) => onRowClick(e, task)} onDoubleClick={() => !compact && setRenaming(task.id)} title="Details öffnen (Doppelklick: umbenennen)">
                  <span className="rem-title">
                    {task.priority === 'hoch' && <span className="rem-prio hoch">Hoch</span>}
                    {task.priority === 'niedrig' && !compact && <span className="rem-prio niedrig">Niedrig</span>}
                    {task.title}
                  </span>
                  {task.note && !compact && <span className="rem-note">{task.note}</span>}
                  <span className="rem-meta">
                    {task.due && (
                      <span className={overdue ? 'rem-overdue' : ''} title={formatDate(task.due)}>
                        <CalendarDays size={12} aria-hidden />
                        {cap(relativeLabel(task.due, t))}
                        {task.dueTime && `, ${task.dueTime}`}
                      </span>
                    )}
                    {task.remind && task.dueTime && <span title="Erinnerung"><Bell size={12} aria-label="Erinnerung" /></span>}
                    {!compact && task.repeat && <span><Repeat size={12} aria-hidden />{describeTaskRepeat(task.repeat, task.due ?? task.plannedFor ?? null)}</span>}
                    {!compact && !done && (when === 'morgen' || when === 'datum') && task.plannedFor && (
                      <span><Sun size={12} aria-hidden />{when === 'morgen' ? 'Morgen' : `Ab ${shortDate(task.plannedFor)}`}</span>
                    )}
                    {!compact && !done && when === 'irgendwann' && <span><Archive size={12} aria-hidden />Irgendwann</span>}
                    {!compact && !done && when === 'abends' && <span className="rem-when-evening"><Moon size={12} aria-hidden />Abends</span>}
                    {showCourse && !compact && (course || list) && (
                      <span className="rem-listdot"><i style={{ background: color }} aria-hidden />{course ? course.code || course.name : list!.name}</span>
                    )}
                    {!compact && task.kind !== 'Aufgabe' && <span>{task.kind}</span>}
                    {!compact && task.status === 'in Arbeit' && <span className="rem-doing">in Arbeit</span>}
                    {subs.length > 0 && <span>{subsDone} von {subs.length}</span>}
                    {!compact && task.estimate && <span className="rem-est"><Timer size={12} aria-hidden />{formatMinutes(task.estimate)}</span>}
                    {!compact && (task.tags ?? []).map((tag) => <span key={tag} className="rem-tag">@{tag}</span>)}
                  </span>
                </button>
              )}
              {subs.length > 0 && !compact && (
                <button
                  type="button"
                  className={`icon rem-expand ${isOpen ? 'open' : ''}`}
                  onClick={() => setExpanded((s) => { const n = new Set(s); if (n.has(task.id)) n.delete(task.id); else n.add(task.id); return n; })}
                  aria-expanded={isOpen}
                  aria-label={isOpen ? 'Unteraufgaben zuklappen' : 'Unteraufgaben zeigen'}
                >
                  <ChevronRight size={16} />
                </button>
              )}
              {!compact && !done && (
                <button type="button" className="icon rem-focus" onClick={() => actions.startFocus(task)} aria-label="Fokus starten" title="Fokus starten">
                  <Play size={14} />
                </button>
              )}
              <button
                type="button"
                className={`icon rem-flag ${task.flagged ? 'on' : ''}`}
                onClick={() => update('tasks', task.id, { flagged: !task.flagged })}
                aria-label={task.flagged ? 'Markierung entfernen' : 'Markieren'}
                aria-pressed={!!task.flagged}
                title={task.flagged ? 'Markierung entfernen' : 'Markieren'}
              >
                <Flag size={16} fill={task.flagged ? 'currentColor' : 'none'} />
              </button>
              {sortable && !compact && (
                <span className="rem-grip" title="Ziehen zum Verschieben" aria-hidden><GripVertical size={16} /></span>
              )}
            </div>
            {isOpen && subs.length > 0 && (
              <ul className="rem-subs">
                {subs.map((s) => (
                  <li key={s.id} className={s.done ? 'done' : ''}>
                    <label>
                      <input
                        type="checkbox"
                        checked={s.done}
                        onChange={() => update('tasks', task.id, { subtasks: subs.map((x) => (x.id === s.id ? { ...x, done: !x.done } : x)) })}
                      />
                      {s.title}
                    </label>
                  </li>
                ))}
              </ul>
            )}
          </li>
        );
      })}
    </ul>
  );
}

/** Ein Ziel für gezogene Aufgaben in der Seitenleiste: `target` wie in `dropPatch` */
export const dropTarget = (target: string) => (dropPatch(target, today()) ? { 'data-drop': target } : {});
