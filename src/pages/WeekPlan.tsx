import { useEffect, useMemo, useState, type DragEvent, type ReactNode } from 'react';
import { newId, useStore } from '../store';
import type { DateStr, ID, Task, WeekFocus, WeekPlan } from '../types';
import { addDays, parseDate, today } from '../lib/dates';
import { isMultiDay, onDay, sortEntries, type CalendarEntry } from '../lib/calendar';
import { minutesLabel, taskMinutes } from '../lib/dayplan';
import { formatMoney } from '../lib/life';
import { listTasks } from '../lib/tasks';
import { mealTitle } from '../lib/recipes';
import { success, tap } from '../lib/haptics';
import {
  aheadTasks, autoPlan, budgetPlan, clashes, daysOf, focusState, focusSuggestions, isAppointment, isPressing, LOAD_LABELS, MAX_FOCUS, planFor,
  planningWeek, rotationFor, spentBetween, taskDay, trainingTarget, unplannedTasks, weekLoads, weekNumber, weekRange, type DayLoad, type FocusSuggestion,
} from '../lib/weekplan';
import { useCalendarEntries } from '../components/calendar';
import { dayColor } from '../components/lifting';
import { useToast } from '../components/toast';
import { PageHeader } from '../components/ui';
import { MealWeek } from './Meals';
import { Sym } from '../components/icons';

const STEPS = [
  { id: 'termine', label: 'Termine', icon: '📅', next: 'Wochenziele' },
  { id: 'ziele', label: 'Wochenziele', icon: '🎯', next: 'Aufgaben' },
  { id: 'aufgaben', label: 'Aufgaben', icon: '✅', next: 'Training & Essen' },
  { id: 'koerper', label: 'Training & Essen', icon: '🏋️', next: 'Budget' },
  { id: 'budget', label: 'Budget', icon: '💶', next: '' },
] as const;
type StepId = (typeof STEPS)[number]['id'];

const WD = ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa'];
const wdShort = (d: DateStr) => WD[parseDate(d).getDay()];
const dayLong = (d: DateStr) => parseDate(d).toLocaleDateString('de-DE', { weekday: 'long', day: 'numeric', month: 'long' });
const dayNum = (d: DateStr) => `${parseDate(d).getDate()}.`;
const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
/** Ganze Euro ohne „,00“ – „135 €“ statt „135,00 €“ */
const euros = (n: number) => formatMoney(n).replace(/,00(?=\s*€)/, '');
const joinAnd = (list: string[]) => (list.length <= 1 ? list.join('') : `${list.slice(0, -1).join(', ')} und ${list[list.length - 1]}`);

const KIND_ICON: Partial<Record<CalendarEntry['kind'], string>> = { birthday: '🎂', trip: '✈️', exam: '📝', project: '🚀' };
const KIND_COLOR: Record<CalendarEntry['kind'], string> = {
  event: '#007AFF', lecture: '#5856D6', exam: '#FF3B30', study: '#30B0C7', birthday: '#FF2D55', trip: '#32ADE6', project: '#AF52DE', task: '#8E8E93',
};
const entryColor = (e: CalendarEntry) => e.color ?? KIND_COLOR[e.kind];

/** Was gerade gezogen wird (HTML-Drag-and-Drop gibt die Daten erst beim Loslassen heraus) */
type Dragged = { kind: 'task' | 'workout' | 'meal'; id: ID };
let dragged: Dragged | null = null;

/** Breiter Bildschirm: Wochen-Board mit sieben Spalten statt Listen */
function useWide(): boolean {
  const query = '(min-width: 1100px)';
  const [wide, setWide] = useState(() => typeof window !== 'undefined' && !!window.matchMedia?.(query).matches);
  useEffect(() => {
    const m = window.matchMedia(query);
    const on = () => setWide(m.matches);
    m.addEventListener('change', on);
    return () => m.removeEventListener('change', on);
  }, []);
  return wide;
}

/** Ziehen und Ablegen auf einen Tag – für Aufgaben, Trainings und Essen gleich */
function useDropOnDay() {
  const { data, update } = useStore();
  const [over, setOver] = useState<DateStr | 'pool' | null>(null);
  const drop = (target: DateStr | 'pool') => {
    const item = dragged;
    dragged = null;
    setOver(null);
    if (!item) return;
    if (item.kind === 'task') {
      update('tasks', item.id, target === 'pool' ? { plannedFor: null, plannedTime: undefined } : { plannedFor: target, plannedTime: undefined, someday: false, evening: false });
    } else if (target !== 'pool' && item.kind === 'workout') {
      const w = data.workouts.find((x) => x.id === item.id);
      if (w && !w.done) update('workouts', item.id, { date: target });
    } else if (target !== 'pool' && item.kind === 'meal') {
      update('meals', item.id, { date: target });
    }
    tap();
  };
  const zone = (target: DateStr | 'pool') => ({
    onDragOver: (e: DragEvent) => {
      if (!dragged || (target === 'pool' && dragged.kind !== 'task')) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      if (over !== target) setOver(target);
    },
    onDragLeave: (e: DragEvent) => {
      if (!(e.currentTarget as HTMLElement).contains(e.relatedTarget as Node)) setOver((o) => (o === target ? null : o));
    },
    onDrop: (e: DragEvent) => {
      e.preventDefault();
      drop(target);
    },
  });
  return { over, zone };
}

const dragProps = (item: Dragged) => ({
  draggable: true,
  onDragStart: (e: DragEvent) => {
    dragged = item;
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', `${item.kind}:${item.id}`);
  },
  onDragEnd: () => {
    dragged = null;
  },
});

/** Auslastung eines Tages: feste Termine und Geplantes im Verhältnis zur wachen Zeit */
function LoadBar({ load }: { load: DayLoad }) {
  const fixed = Math.min(1, load.fixed / load.awake);
  const planned = Math.min(1 - fixed, load.planned / load.awake);
  return (
    <span className={`wp-load ${load.level}`} title={`${minutesLabel(load.fixed)} fest · ${minutesLabel(load.planned)} geplant · ${LOAD_LABELS[load.level]}`} aria-label={`Auslastung: ${LOAD_LABELS[load.level]}`} role="img">
      <i className="fixed" style={{ width: `${fixed * 100}%` }} />
      <i className="planned" style={{ width: `${planned * 100}%` }} />
    </span>
  );
}

function StepBar({ step, onPick }: { step: number; onPick: (i: number) => void }) {
  return (
    <ol className="wp-steps" aria-label="Schritte">
      {STEPS.map((s, i) => (
        <li key={s.id} className={i === step ? 'on' : i < step ? 'done' : ''}>
          <button type="button" onClick={() => onPick(i)} aria-current={i === step ? 'step' : undefined}>
            <span className="wp-step-num" aria-hidden>{i < step ? '✓' : i + 1}</span>
            <span className="wp-step-label">{s.label}</span>
          </button>
        </li>
      ))}
    </ol>
  );
}

const appointmentsOn = (entries: CalendarEntry[], day: DateStr) => sortEntries(entries.filter((e) => isAppointment(e) && onDay(e, day)));

function EntryRow({ e }: { e: CalendarEntry }) {
  return (
    <li className="wp-entry">
      <span className="wp-dot" style={{ background: entryColor(e) }} aria-hidden />
      <span className="wp-entry-time">{e.time || 'ganztags'}</span>
      <span className="wp-entry-label">{KIND_ICON[e.kind] ? `${KIND_ICON[e.kind]} ` : ''}{e.label}</span>
    </li>
  );
}

/* ---------- Schritt 1: Termine ---------- */

function StepEvents({ days, entries, loads, wide }: { days: DateStr[]; entries: CalendarEntry[]; loads: DayLoad[]; wide: boolean }) {
  const perDay = days.map((d) => appointmentsOn(entries, d).filter((e) => !isMultiDay(e) || e.start === d || d === days[0]));
  const all = perDay.flat();
  const count = (k: CalendarEntry['kind']) => all.filter((e) => e.kind === k).length;
  const parts = [
    count('lecture') && plural(count('lecture'), 'Vorlesung', 'Vorlesungen'),
    count('exam') && plural(count('exam'), 'Prüfung', 'Prüfungen'),
    count('birthday') && plural(count('birthday'), 'Geburtstag', 'Geburtstage'),
    count('trip') && plural(count('trip'), 'Reise', 'Reisen'),
  ].filter(Boolean) as string[];
  const clash = clashes(entries, days);
  const heavy = loads.filter((l) => l.level === 'voll' || l.level === 'zuviel').map((l) => wdShort(l.day));
  const calm = loads.filter((l) => (l.level === 'frei' || l.level === 'locker') && parseDate(l.day).getDay() % 6 !== 0).map((l) => wdShort(l.day));
  return (
    <>
      <p className="wp-lead">
        {all.length === 0 ? 'Noch nichts im Kalender – eine ruhige Woche.' : <>{plural(all.length, 'Termin', 'Termine')}{parts.length ? <> – davon {joinAnd(parts)}</> : null}.</>}
      </p>
      {(clash.length > 0 || heavy.length > 0 || calm.length > 0) && (
        <ul className="wp-notes">
          {clash.map((c) => <li key={`${c.day}-${c.a}-${c.b}`} className="warn">⚠️ {wdShort(c.day)}: „{c.a}“ und „{c.b}“ überschneiden sich</li>)}
          {heavy.length > 0 && <li>🔴 Volle Tage: <strong>{joinAnd(heavy)}</strong> – plan dort wenig dazu.</li>}
          {calm.length > 0 && calm.length <= 3 && <li>🟢 Viel Luft: <strong>{joinAnd(calm)}</strong> – gut für Großes.</li>}
          {calm.length > 3 && !heavy.length && <li>🟢 Unter der Woche ist überall Luft – gut für Großes.</li>}
        </ul>
      )}
      {!wide && (
        <ul className="wp-days">
          {days.map((d, i) => (
            <li key={d}>
              <div className="wp-day-head">
                <strong>{dayLong(d)}</strong>
                <LoadBar load={loads[i]} />
              </div>
              {perDay[i].length ? <ul className="wp-entries">{perDay[i].map((e) => <EntryRow key={`${e.key}-${d}`} e={e} />)}</ul> : <span className="muted small">Nichts eingetragen</span>}
            </li>
          ))}
        </ul>
      )}
      <a className="wp-link" href="#/kalender">Im Kalender ergänzen →</a>
    </>
  );
}

/* ---------- Schritt 2: Wochenziele ---------- */

function StepFocus({ week, plan, save }: { week: DateStr; plan?: WeekPlan; save: (fn: (p: WeekPlan) => Partial<WeekPlan>) => void }) {
  const { data } = useStore();
  const [text, setText] = useState('');
  const focus = plan?.focus ?? [];
  const suggestions = focusSuggestions(data, week).filter((s) => !focus.some((f) => f.text.toLowerCase() === s.text.toLowerCase()));
  const full = focus.length >= MAX_FOCUS;
  const add = (s: Omit<WeekFocus, 'id' | 'done'> | FocusSuggestion) => {
    if (full) return;
    const item: WeekFocus = { id: newId(), text: s.text, done: false, icon: s.icon, measure: s.measure, goalId: s.goalId };
    save((p) => ({ focus: [...p.focus, item].slice(0, MAX_FOCUS) }));
    tap();
  };
  return (
    <>
      <p className="wp-lead">Drei Dinge, die diese Woche wirklich zählen. Was sich messen lässt, hakt sich von selbst ab.</p>
      <ol className="wp-focus">
        {Array.from({ length: MAX_FOCUS }, (_, i) => {
          const f = focus[i];
          return f ? (
            <li key={f.id} className="filled">
              <span className="wp-num">{i + 1}</span>
              <span className="grow">
                <strong>{f.icon ? `${f.icon} ` : ''}{f.text}</strong>
                {f.measure && <small className="muted">misst sich selbst</small>}
              </span>
              <button type="button" className="icon" aria-label={`„${f.text}“ entfernen`} onClick={() => save((p) => ({ focus: p.focus.filter((x) => x.id !== f.id) }))}>×</button>
            </li>
          ) : (
            <li key={`frei-${i}`} className="empty"><span className="wp-num">{i + 1}</span><span className="muted">Noch frei</span></li>
          );
        })}
      </ol>
      {!full && (
        <form
          className="row wp-own"
          onSubmit={(e) => {
            e.preventDefault();
            if (!text.trim()) return;
            add({ text: text.trim(), icon: '⭐' });
            setText('');
          }}
        >
          <input className="grow" value={text} onChange={(e) => setText(e.target.value)} placeholder="Eigenes Wochenziel, z. B. Bewerbung abschicken" aria-label="Eigenes Wochenziel" />
          <button type="submit" disabled={!text.trim()}>Hinzufügen</button>
        </form>
      )}
      {!full && suggestions.length > 0 && (
        <>
          <h3 className="wp-sub">Vorschläge</h3>
          <ul className="wp-suggest">
            {suggestions.map((s) => (
              <li key={s.key}>
                <button type="button" onClick={() => add(s)}>
                  <span className="wp-suggest-icon" aria-hidden>{s.icon ?? '🎯'}</span>
                  <span className="grow">
                    <strong>{s.text}</strong>
                    <small className="muted">{s.hint}{s.measure ? ' · misst sich selbst' : ''}</small>
                  </span>
                  <span className="wp-plus" aria-hidden>＋</span>
                </button>
              </li>
            ))}
          </ul>
        </>
      )}
      {full && <p className="muted small">Drei Wochenziele stehen. Entferne eins, um ein anderes zu wählen.</p>}
    </>
  );
}

/* ---------- Schritt 3: Aufgaben ---------- */

const KEEP_KEY = 'antonos:woche-wochenende-frei';
function useKeepWeekend(): [boolean, (v: boolean) => void] {
  const [keep, setKeep] = useState(() => {
    try {
      return localStorage.getItem(KEEP_KEY) !== '0';
    } catch {
      return true;
    }
  });
  return [keep, (v) => {
    setKeep(v);
    try {
      localStorage.setItem(KEEP_KEY, v ? '1' : '0');
    } catch {
      // egal
    }
  }];
}

function taskMeta(x: Task, days: DateStr[]): string {
  const parts: string[] = [];
  if (x.due) parts.push(x.due < days[0] ? 'überfällig' : x.due <= days[6] ? `Frist ${wdShort(x.due)}` : `Frist ${parseDate(x.due).toLocaleDateString('de-DE', { day: 'numeric', month: 'numeric' })}`);
  if (x.flagged) parts.push('⚑');
  if (x.priority === 'hoch') parts.push('wichtig');
  parts.push(x.estimate ? minutesLabel(x.estimate) : `≈ ${minutesLabel(taskMinutes(x))}`);
  return parts.join(' · ');
}

function StepTasks({ days, loads, t, wide, drop }: { days: DateStr[]; loads: DayLoad[]; t: DateStr; wide: boolean; drop: ReturnType<typeof useDropOnDay> }) {
  const { data, update, mutate } = useStore();
  const { show } = useToast();
  const [keepWeekend, setKeepWeekend] = useKeepWeekend();
  const [all, setAll] = useState(false);
  const [open, setOpen] = useState<DateStr | null>(null);
  const pool = unplannedTasks(data.tasks, days);
  const pressing = pool.filter((x) => isPressing(x, days));
  const rest = pool.filter((x) => !isPressing(x, days));
  const shown = [...pressing, ...(all ? rest : rest.slice(0, Math.max(0, 6 - pressing.length)))];
  const from = t > days[0] ? t : days[0];
  const planned = listTasks(data.tasks).filter((x) => taskDay(x, days));

  const assign = (x: Task, day: DateStr | null) => {
    update('tasks', x.id, day ? { plannedFor: day, plannedTime: undefined, someday: false, evening: false } : { plannedFor: null, plannedTime: undefined });
    tap();
  };
  const ahead = aheadTasks(data.tasks, days, from);
  const count = pressing.length + ahead.length;
  const auto = () => {
    const { placed, left } = autoPlan(data.tasks, loads, days, { from, keepWeekend });
    if (!placed.length) {
      show('Diese Woche ist schon voll – nimm lieber etwas raus.');
      return;
    }
    const before = new Map(placed.map((p) => [p.taskId, data.tasks.find((x) => x.id === p.taskId)?.plannedFor ?? null]));
    const at = new Map(placed.map((p) => [p.taskId, p.day]));
    mutate((d) => ({ ...d, tasks: d.tasks.map((x) => (at.has(x.id) ? { ...x, plannedFor: at.get(x.id)!, plannedTime: undefined, someday: false, evening: false } : x)) }));
    success();
    show(`✨ ${plural(placed.length, 'Aufgabe', 'Aufgaben')} verteilt${left.length ? ` – ${left.length} ${left.length === 1 ? 'passt' : 'passen'} nicht mehr rein` : ''}`, {
      label: 'Widerrufen',
      run: () => mutate((d) => ({ ...d, tasks: d.tasks.map((x) => (before.has(x.id) ? { ...x, plannedFor: before.get(x.id) ?? null } : x)) })),
    }, 8000);
  };

  return (
    <>
      <p className="wp-lead">
        {pool.length === 0 ? 'Alles Offene hat schon einen Tag. 👌' : wide ? 'Zieh Aufgaben auf einen Tag – oder lass AntonOS das Dringende verteilen.' : 'Tipp auf einen Tag – oder lass AntonOS das Dringende verteilen.'}
      </p>
      <div className="row wrap wp-auto">
        <button type="button" className="primary" onClick={auto} disabled={count === 0}>✨ {count ? `${plural(count, 'Aufgabe', 'Aufgaben')} verteilen` : 'Nichts Dringendes'}</button>
        <label className="check small"><input type="checkbox" checked={keepWeekend} onChange={(e) => setKeepWeekend(e.target.checked)} /> Wochenende frei halten</label>
      </div>
      {count > 0 && (
        <p className="muted small wp-hint">
          Verteilt {joinAnd([pressing.length ? plural(pressing.length, 'dringende Aufgabe', 'dringende Aufgaben') : '', ahead.length ? `${plural(ahead.length, 'große Aufgabe', 'große Aufgaben')} mit Frist` : ''].filter(Boolean))} nach freier Zeit – möglichst einen Tag vor dem Abgabetag.
        </p>
      )}
      {pool.length > 0 && (
        <ul className={`wp-pool ${wide ? 'cards' : ''} ${drop.over === 'pool' ? 'over' : ''}`} {...drop.zone('pool')} aria-label="Noch ohne Tag">
          {shown.map((x) => (
            <li key={x.id} className={`wp-task ${isPressing(x, days) ? 'pressing' : ''}`} {...(wide ? dragProps({ kind: 'task', id: x.id }) : {})}>
              <span className="wp-task-main">
                <strong>{x.title}</strong>
                <small className="muted">{taskMeta(x, days)}</small>
              </span>
              {!wide && (
                <span className="wp-daypick" role="group" aria-label={`„${x.title}“ einplanen`}>
                  {days.map((d) => (
                    <button key={d} type="button" disabled={d < t} onClick={() => assign(x, d)} aria-label={dayLong(d)} title={dayLong(d)}>{wdShort(d)}</button>
                  ))}
                </span>
              )}
            </li>
          ))}
          {!all && rest.length > shown.length - pressing.length && (
            <li className="wp-more"><button type="button" className="link" onClick={() => setAll(true)}>{plural(rest.length - (shown.length - pressing.length), 'weitere Aufgabe', 'weitere Aufgaben')} zeigen</button></li>
          )}
        </ul>
      )}
      {!wide && (
        <>
          <h3 className="wp-sub">So sieht deine Woche aus</h3>
          <ul className="wp-week">
            {days.map((d, i) => {
              const list = planned.filter((x) => taskDay(x, days) === d);
              const minutes = list.reduce((s, x) => s + taskMinutes(x), 0);
              return (
                <li key={d} className={open === d ? 'open' : ''}>
                  <button type="button" className="wp-week-row" onClick={() => setOpen(open === d ? null : d)} aria-expanded={open === d}>
                    <strong>{wdShort(d)} {dayNum(d)}</strong>
                    <LoadBar load={loads[i]} />
                    <small className="muted">{list.length ? `${list.length} · ${minutesLabel(minutes)}` : '–'}</small>
                  </button>
                  {open === d && (
                    <ul className="wp-week-tasks">
                      {list.length === 0 && <li className="muted small">Noch keine Aufgaben</li>}
                      {list.map((x) => (
                        <li key={x.id}>
                          <span className="grow">{x.title}{x.due === d && !x.plannedFor ? <small className="muted"> · Frist</small> : null}</span>
                          {x.plannedFor === d && <button type="button" className="icon" aria-label={`„${x.title}“ wieder ohne Tag`} onClick={() => assign(x, null)}>×</button>}
                        </li>
                      ))}
                    </ul>
                  )}
                </li>
              );
            })}
          </ul>
        </>
      )}
    </>
  );
}

/* ---------- Schritt 4: Training & Essen ---------- */

function StepBody({ days, t }: { days: DateStr[]; t: DateStr }) {
  const { data, add, remove } = useStore();
  const target = trainingTarget(data.goals);
  const inWeek = data.workouts.filter((w) => days.includes(w.date));
  const lastType = [...data.workouts].sort((a, b) => b.date.localeCompare(a.date)).find((w) => w.type)?.type ?? 'Krafttraining';
  const nextFor = (d: DateStr) => rotationFor(data.trainingPlan, [...data.workouts.filter((w) => w.done), ...inWeek.filter((w) => !w.done && w.date < d).map((w) => ({ ...w, done: true }))], [d])[0];
  const toggle = (d: DateStr) => {
    const here = inWeek.filter((w) => w.date === d);
    if (here.length) {
      const open = here.filter((w) => !w.done);
      for (const w of open) remove('workouts', w.id);
      if (open.length) tap();
      return;
    }
    const day = nextFor(d);
    add('workouts', { title: day?.name ?? lastType, type: day ? 'Krafttraining' : lastType, date: d, done: false, notes: '', planDayId: day?.id });
    tap();
  };
  return (
    <>
      <div className="wp-train-head">
        <h3 className="wp-sub">Training</h3>
        <span className={`wp-count ${inWeek.length >= target ? 'ok' : ''}`}>{inWeek.length} / {target}</span>
      </div>
      <p className="muted small">Tipp auf die Tage, an denen du trainierst.{data.trainingPlan.length ? ' Die Reihenfolge aus deinem Trainingsplan läuft weiter.' : ''}</p>
      <div className="wp-train" role="group" aria-label="Trainingstage">
        {days.map((d) => {
          const here = inWeek.filter((w) => w.date === d);
          const preview = here.length ? null : nextFor(d);
          const done = here.some((w) => w.done);
          const color = here[0]?.planDayId ? dayColor(data.trainingPlan, here[0].planDayId) : undefined;
          return (
            <button
              key={d}
              type="button"
              className={`wp-train-day ${here.length ? 'on' : ''} ${done ? 'done' : ''}`}
              style={color ? { ['--c' as string]: color } : undefined}
              disabled={d < t && !here.length}
              aria-pressed={here.length > 0}
              onClick={() => toggle(d)}
              title={here.length ? (done ? 'Schon trainiert' : 'Antippen zum Entfernen') : `Antippen: ${preview?.name ?? lastType}`}
            >
              <small>{wdShort(d)}</small>
              <strong>{here.length ? (done ? '✓' : '🏋️') : '+'}</strong>
              <span>{here[0]?.title ?? preview?.name ?? ''}</span>
            </button>
          );
        })}
      </div>
      <MealWeek anchor={days[0]} title="Essen" compact />
    </>
  );
}

/* ---------- Schritt 5: Budget ---------- */

function StepBudget({ week, t, plan, entries, value, setValue }: { week: DateStr; t: DateStr; plan?: WeekPlan; entries: CalendarEntry[]; value: string; setValue: (v: string) => void }) {
  const { data } = useStore();
  const b = budgetPlan(data, week, t);
  const days = daysOf(week);
  const birthdays = days.flatMap((d) => entries.filter((e) => e.kind === 'birthday' && onDay(e, d)).map((e) => ({ d, label: e.label })));
  const amount = Number(value.replace(',', '.'));
  const step = (by: number) => setValue(String(Math.max(0, Math.round(((Number.isFinite(amount) ? amount : 0) + by) / 5) * 5)));
  const lastWeek = spentBetween(data.transactions, addDays(week, -7), addDays(week, -1));
  const rest = Math.max(0, b.monthBudget - b.monthSpent - b.fixedLeft);
  return (
    <>
      <p className="wp-lead">Wie viel darf die Woche für den Alltag kosten – ohne Miete, Abos und Sparen?</p>
      <div className="wp-budget">
        <button type="button" className="icon" aria-label="5 € weniger" onClick={() => step(-5)}>−</button>
        <label className="wp-budget-field">
          <input inputMode="decimal" value={value} onChange={(e) => setValue(e.target.value.replace(/[^\d,.]/g, ''))} aria-label="Wochenbudget in Euro" placeholder="0" />
          <span aria-hidden>€</span>
        </label>
        <button type="button" className="icon" aria-label="5 € mehr" onClick={() => step(5)}>+</button>
      </div>
      {b.suggestion > 0 && amount !== b.suggestion && (
        <button type="button" className="link wp-take" onClick={() => setValue(String(b.suggestion))}>Vorschlag übernehmen: {euros(b.suggestion)}</button>
      )}
      {b.basis === 'monat' && (
        <dl className="wp-calc">
          <div><dt>Monatsbudget</dt><dd>{euros(b.monthBudget)}</dd></div>
          <div><dt>Schon ausgegeben</dt><dd>− {euros(b.monthSpent)}</dd></div>
          <div><dt>Feste Zahlungen bis Monatsende</dt><dd>− {euros(b.fixedLeft)}</dd></div>
          <div className="sum"><dt>Übrig für {plural(b.daysLeft, 'Tag', 'Tage')}</dt><dd>{euros(rest)}</dd></div>
          <div className="sum"><dt>Macht pro Woche</dt><dd>{euros(b.suggestion)}</dd></div>
        </dl>
      )}
      {b.basis === 'schnitt' && <p className="muted small wp-basis">Vorschlag {euros(b.suggestion)}: So viel hast du in den letzten vier Wochen im Schnitt für den Alltag ausgegeben. Mit einem Monatsbudget unter Finanzen wird der Vorschlag genauer.</p>}
      {b.basis === 'keins' && <p className="muted small wp-basis">Noch keine Ausgaben zum Rechnen – setz einfach einen Betrag. Unter der Woche zeigt „Heute“, wie viel noch übrig ist.</p>}
      {(lastWeek > 0 || (plan?.budget && plan.budget !== amount)) && (
        <p className="muted small wp-basis">
          {lastWeek > 0 && <>Letzte Woche hast du {euros(lastWeek)} für den Alltag ausgegeben.</>}
          {plan?.budget && plan.budget !== amount ? <> Bisher bestätigt: {euros(plan.budget)}.</> : null}
        </p>
      )}
      {(b.fixedWeek.length > 0 || birthdays.length > 0) && (
        <ul className="wp-notes">
          {b.fixedWeek.map((f) => <li key={f.id}>📆 {wdShort(f.date)}: {f.description} wird abgebucht ({euros(f.amount)})</li>)}
          {birthdays.map((x) => <li key={`${x.d}-${x.label}`}>🎁 {wdShort(x.d)}: {x.label} – Geschenk einplanen?</li>)}
        </ul>
      )}
    </>
  );
}

/* ---------- Fertig ---------- */

/** Kennzahlen der geplanten Woche: Termine, Aufgaben mit Tag, Trainings, Essen */
function useWeekStats(week: DateStr, entries: CalendarEntry[]): [string, number][] {
  const { data } = useStore();
  const days = daysOf(week);
  const appts = days.reduce((s, d) => s + appointmentsOn(entries, d).filter((e) => !isMultiDay(e) || e.start === d || d === days[0]).length, 0);
  return [
    ['Termine', appts],
    ['Aufgaben', listTasks(data.tasks).filter((x) => taskDay(x, days)).length],
    ['Trainings', data.workouts.filter((w) => days.includes(w.date)).length],
    ['Essen geplant', data.meals.filter((m) => days.includes(m.date)).length],
  ];
}

function FocusList({ week, plan, className }: { week: DateStr; plan?: WeekPlan; className: string }) {
  const { data } = useStore();
  if (!plan?.focus.length) return null;
  return (
    <ol className={className}>
      {plan.focus.map((f) => {
        const s = focusState(f, data, week);
        return <li key={f.id} className={s.done ? 'done' : ''}><span aria-hidden>{f.icon ?? '🎯'}</span><strong>{f.text}</strong>{s.text ? <small className="muted">{s.text}</small> : <span />}</li>;
      })}
    </ol>
  );
}

function Finished({ week, plan, entries, onEdit }: { week: DateStr; plan: WeekPlan; entries: CalendarEntry[]; onEdit: () => void }) {
  const stats = useWeekStats(week, entries);
  return (
    <section className="wp-done">
      <span className="wp-done-badge" aria-hidden>✓</span>
      <h2>Deine Woche steht</h2>
      <p className="muted">KW {weekNumber(week)} · {weekRange(week)}</p>
      <FocusList week={week} plan={plan} className="wp-done-focus" />
      <div className="wp-done-stats">
        {stats.map(([label, value]) => <div key={label}><strong>{value}</strong><small>{label}</small></div>)}
        {plan.budget ? <div><strong>{euros(plan.budget)}</strong><small>Budget</small></div> : null}
      </div>
      <div className="row wrap center">
        <a className="button primary" href="#/heute">Zu „Heute“</a>
        <button type="button" onClick={onEdit}>Anpassen</button>
      </div>
    </section>
  );
}

/** Am PC neben dem Schritt: was bisher für die Woche steht */
function WeekSummary({ week, plan, entries, budget }: { week: DateStr; plan?: WeekPlan; entries: CalendarEntry[]; budget: string }) {
  const stats = useWeekStats(week, entries);
  const amount = Number(budget.replace(',', '.'));
  return (
    <aside className="wp-aside" aria-label="Deine Woche bisher">
      <h3>Deine Woche</h3>
      {plan?.focus.length ? <FocusList week={week} plan={plan} className="wp-aside-focus" /> : <p className="muted small">Noch keine Wochenziele.</p>}
      <dl className="wp-aside-stats">
        {stats.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}
        <div><dt>Budget</dt><dd>{amount > 0 ? euros(amount) : '–'}</dd></div>
      </dl>
    </aside>
  );
}

/* ---------- Wochen-Board (PC) ---------- */

function WeekBoard({ days, entries, loads, t, layer, drop }: { days: DateStr[]; entries: CalendarEntry[]; loads: DayLoad[]; t: DateStr; layer: StepId; drop: ReturnType<typeof useDropOnDay> }) {
  const { data } = useStore();
  const tasks = listTasks(data.tasks);
  return (
    <div className={`wp-board layer-${layer}`} aria-label="Wochen-Board">
      {days.map((d, i) => {
        const appts = appointmentsOn(entries, d);
        const dayTasks = tasks.filter((x) => taskDay(x, days) === d).sort((a, b) => (a.plannedTime ?? '99').localeCompare(b.plannedTime ?? '99'));
        const workouts = data.workouts.filter((w) => w.date === d);
        const meals = data.meals.filter((m) => m.date === d).sort((a, b) => a.slot.localeCompare(b.slot)).reverse();
        return (
          <section key={d} className={`wp-col ${d === t ? 'today' : ''} ${d < t ? 'past' : ''} ${drop.over === d ? 'over' : ''}`} {...drop.zone(d)} aria-label={dayLong(d)}>
            <header>
              <span><strong>{wdShort(d)}</strong> {dayNum(d)}</span>
              <small className={`wp-level ${loads[i].level}`}>{LOAD_LABELS[loads[i].level]}</small>
              <LoadBar load={loads[i]} />
            </header>
            <ul className="wp-layer appts">
              {appts.map((e) => (
                <li key={`${e.key}-${d}`} className="wp-card appt" style={{ ['--c' as string]: entryColor(e) }} title={e.label}>
                  {e.time && <small>{e.time}</small>}
                  <span>{KIND_ICON[e.kind] ? `${KIND_ICON[e.kind]} ` : ''}{e.label}</span>
                </li>
              ))}
            </ul>
            <ul className="wp-layer body">
              {workouts.map((w) => (
                <li key={w.id} className={`wp-card train ${w.done ? 'done' : ''}`} {...(w.done ? {} : dragProps({ kind: 'workout', id: w.id }))} title={w.done ? 'Erledigt' : 'Auf einen anderen Tag ziehen'}>
                  <span>{w.done ? '✓' : '🏋️'} {w.title || w.type}</span>
                  {w.time && <small>{w.time}</small>}
                </li>
              ))}
              {meals.map((m) => (
                <li key={m.id} className="wp-card meal" {...dragProps({ kind: 'meal', id: m.id })} title="Auf einen anderen Tag ziehen">
                  <span>🍽️ {mealTitle(m, data.recipes)}</span>
                  <small>{m.slot === 'mittag' ? 'Mittag' : 'Abend'}</small>
                </li>
              ))}
            </ul>
            <ul className="wp-layer tasks">
              {dayTasks.map((x) => (
                <li key={x.id} className={`wp-card task ${isPressing(x, days) ? 'pressing' : ''}`} {...dragProps({ kind: 'task', id: x.id })} title="Auf einen anderen Tag ziehen">
                  <span>{x.title}</span>
                  <small>{x.plannedTime ? `${x.plannedTime} · ` : ''}{minutesLabel(taskMinutes(x))}{x.due === d ? ' · Frist' : ''}</small>
                </li>
              ))}
            </ul>
          </section>
        );
      })}
    </div>
  );
}

/* ---------- Seite ---------- */

export function WeekPlanner({ param }: { param?: string | null }) {
  const { data, mutate } = useStore();
  const { show } = useToast();
  const entries = useCalendarEntries();
  const wide = useWide();
  const drop = useDropOnDay();
  const t = today();
  const [week, setWeek] = useState<DateStr>(() => (param && /^\d{4}-\d{2}-\d{2}$/.test(param) ? daysOf(param)[0] : planningWeek(t)));
  const days = daysOf(week);
  const plan = planFor(data.weekPlans, week);
  const [step, setStep] = useState<number>(() => (plan?.doneAt ? STEPS.length : 0));
  const loads = useMemo(() => weekLoads(data, entries, days), [data, entries, week]); // eslint-disable-line react-hooks/exhaustive-deps
  const [budget, setBudget] = useState('');

  // Neue Woche: Budget-Vorschlag und Startschritt neu setzen
  useEffect(() => {
    const p = planFor(data.weekPlans, week);
    setStep(p?.doneAt ? STEPS.length : 0);
    const b = p?.budget ?? budgetPlan(data, week, t).suggestion;
    setBudget(b ? String(b) : '');
  }, [week]); // eslint-disable-line react-hooks/exhaustive-deps

  const save = (fn: (p: WeekPlan) => Partial<WeekPlan>) =>
    mutate((d) => {
      const list = d.weekPlans ?? [];
      const existing = list.find((p) => p.week === week) ?? { id: newId(), week, focus: [] };
      const next = { ...existing, ...fn(existing) };
      return { ...d, weekPlans: list.some((p) => p.id === existing.id) ? list.map((p) => (p.id === existing.id ? next : p)) : [...list, next] };
    });

  const finish = () => {
    const amount = Number(budget.replace(',', '.'));
    save(() => ({ doneAt: t, budget: Number.isFinite(amount) && amount > 0 ? Math.round(amount * 100) / 100 : null }));
    success();
    show('🗓️ Deine Woche steht – viel Erfolg!');
    setStep(STEPS.length);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };
  const go = (i: number) => {
    setStep(i);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const current = STEPS[Math.min(step, STEPS.length - 1)];
  const isCurrentWeek = week === daysOf(t)[0];
  let body: ReactNode = null;
  if (step >= STEPS.length && plan) body = <Finished week={week} plan={plan} entries={entries} onEdit={() => go(0)} />;
  else if (current.id === 'termine') body = <StepEvents days={days} entries={entries} loads={loads} wide={wide} />;
  else if (current.id === 'ziele') body = <StepFocus week={week} plan={plan} save={save} />;
  else if (current.id === 'aufgaben') body = <StepTasks days={days} loads={loads} t={t} wide={wide} drop={drop} />;
  else if (current.id === 'koerper') body = <StepBody days={days} t={t} />;
  else body = <StepBudget week={week} t={t} plan={plan} entries={entries} value={budget} setValue={setBudget} />;
  const finished = step >= STEPS.length && !!plan;

  return (
    <>
      <PageHeader
        title="Woche planen"
        subtitle={`KW ${weekNumber(week)} · ${weekRange(week)}${isCurrentWeek ? ' · diese Woche' : week > t ? '' : ' · vorbei'}`}
        actions={
          <>
            <button type="button" onClick={() => setWeek(addDays(week, -7))} aria-label="Vorige Woche">‹</button>
            <button type="button" onClick={() => setWeek(planningWeek(t))} disabled={week === planningWeek(t)}>{weekdayIsWeekend(t) ? 'Nächste Woche' : 'Diese Woche'}</button>
            <button type="button" onClick={() => setWeek(addDays(week, 7))} aria-label="Nächste Woche">›</button>
          </>
        }
      />
      <div className={`wp ${wide ? 'wide' : ''}`}>
        {finished ? body : (
          <>
            <StepBar step={step} onPick={go} />
            <div className="wp-main">
              <section className={`wp-panel step-${current.id}`}>
                <header className="wp-panel-head">
                  <span className="wp-panel-icon" aria-hidden><Sym emoji={current.icon} size={22} /></span>
                  <div>
                    <small className="muted">Schritt {step + 1} von {STEPS.length}</small>
                    <h2>{current.label}</h2>
                  </div>
                </header>
                {body}
                <div className="wp-nav">
                  {step > 0 ? <button type="button" onClick={() => go(step - 1)}>Zurück</button> : <span />}
                  {step < STEPS.length - 1
                    ? <button type="button" className="primary" onClick={() => go(step + 1)}>Weiter: {current.next} →</button>
                    : <button type="button" className="primary wp-finish" onClick={finish}>✓ Woche starten</button>}
                </div>
              </section>
              {wide && <WeekSummary week={week} plan={plan} entries={entries} budget={budget} />}
            </div>
            {wide && <WeekBoard days={days} entries={entries} loads={loads} t={t} layer={current.id} drop={drop} />}
          </>
        )}
      </div>
    </>
  );
}

const weekdayIsWeekend = (d: DateStr) => parseDate(d).getDay() % 6 === 0;
