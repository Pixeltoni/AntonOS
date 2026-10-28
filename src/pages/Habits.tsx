import { useState } from 'react';
import { useStore } from '../store';
import type { DateStr, Habit, ID, RingGoals, RingSlot, RingSource, WidgetVariant } from '../types';
import { addDays, parseDate, today } from '../lib/dates';
import { completionRate, formatAmounts, habitAmount, habitSteps, isHabitDone, parseAmounts, streak } from '../lib/life';
import { awards, DEFAULT_SLOT_GOAL, defaultRingGoals, ringSlots, SLOT_COLORS, SOURCE_LABELS, sourceHasGoal } from '../lib/rings';
import { MiniRing, RingsCard } from '../components/rings';
import { Empty, PageHeader, Panel, Progress } from '../components/ui';
import { useToast } from '../components/toast';
import { AddButton, Sheet } from '../components/sheet';

/** Abhaken bzw. wieder öffnen. Mengen-Gewohnheiten werden beim Abhaken auf das Tagesziel gesetzt. */
export function useToggleHabit() {
  const { data, add, update, remove } = useStore();
  return (habitId: ID, date: DateStr) => {
    const habit = data.habits.find((h) => h.id === habitId);
    const log = data.habitLogs.find((l) => l.habitId === habitId && l.date === date);
    if (log && (!habit || isHabitDone(data.habitLogs, habit, date))) remove('habitLogs', log.id);
    else if (log) update('habitLogs', log.id, { amount: habit?.target });
    else add('habitLogs', habit?.target ? { habitId, date, amount: habit.target } : { habitId, date });
  };
}

/** „+ 0,2 l“ bei Mengen-Gewohnheiten */
export function useAddAmount() {
  const { data, add, update } = useStore();
  return (habit: Habit, date: DateStr, step: number) => {
    const log = data.habitLogs.find((l) => l.habitId === habit.id && l.date === date);
    const round = (n: number) => Math.round(n * 1000) / 1000;
    if (log) update('habitLogs', log.id, { amount: round((log.amount ?? 0) + step) });
    else add('habitLogs', { habitId: habit.id, date, amount: step });
  };
}

const num = (n: number) => n.toLocaleString('de-DE', { maximumFractionDigits: 2 });

/** Checkliste für heute – wird auch auf dem Dashboard verwendet. */
export function HabitsToday({ variant = 'standard' }: { variant?: WidgetVariant }) {
  const { data } = useStore();
  const toggle = useToggleHabit();
  const t = today();
  if (data.habits.length === 0) return <Empty>Noch keine Gewohnheiten. <a href="#/gewohnheiten">Anlegen →</a></Empty>;
  const done = data.habits.filter((h) => isHabitDone(data.habitLogs, h, t)).length;
  const week = Array.from({ length: 7 }, (_, i) => addDays(t, i - 6));

  if (variant === 'kompakt') {
    return (
      <div className="habit-chips">
        {data.habits.map((h) => {
          const checked = isHabitDone(data.habitLogs, h, t);
          return (
            <button key={h.id} className={`habit-chip ${checked ? 'on' : ''}`} onClick={() => toggle(h.id, t)} aria-pressed={checked} title={h.name}>
              <span aria-hidden>{h.icon}</span>
            </button>
          );
        })}
        <span className="muted small">{done}/{data.habits.length}</span>
      </div>
    );
  }

  return (
    <div className="col">
      <ul className="list">
        {data.habits.map((h) => {
          const checked = isHabitDone(data.habitLogs, h, t);
          return (
            <li key={h.id} className={`task ${checked ? 'done' : ''} ${variant === 'detail' ? 'wrap' : ''}`}>
              <input type="checkbox" checked={checked} onChange={() => toggle(h.id, t)} aria-label={h.name} />
              <span className="grow task-title">{h.icon} {h.name}</span>
              {h.target && !checked && <span className="muted small">{num(habitAmount(data.habitLogs, h.id, t))}/{num(h.target)} {h.unit}</span>}
              <span className="muted small" title="Serie">🔥 {streak(data.habitLogs, h, t)}</span>
              {variant === 'detail' && (
                <span className="dots" aria-label="Letzte 7 Tage">
                  {week.map((d) => <span key={d} className={isHabitDone(data.habitLogs, h, d) ? 'on' : ''} title={d} />)}
                </span>
              )}
            </li>
          );
        })}
      </ul>
      <Progress value={(done / data.habits.length) * 100} />
      <span className="muted small">{done} von {data.habits.length} erledigt</span>
    </div>
  );
}

function HabitRow({ habit, onEdit }: { habit: Habit; onEdit: () => void }) {
  const { data } = useStore();
  const toggle = useToggleHabit();
  const addAmount = useAddAmount();
  const t = today();
  const done = isHabitDone(data.habitLogs, habit, t);
  const amount = habitAmount(data.habitLogs, habit.id, t);
  const share = habit.target ? (done ? 1 : amount / habit.target) : done ? 1 : 0;
  const s = streak(data.habitLogs, habit, t);
  return (
    <li className={`habit-row ${done ? 'done' : ''}`}>
      <MiniRing share={share} track="rgb(0 184 212 / 0.2)" />
      <button type="button" className="grow habit-row-main" onClick={onEdit} title="Bearbeiten">
        <div className="task-title">{habit.icon} {habit.name}</div>
        <div className="meta">
          {habit.target ? <span>{num(done ? Math.max(amount, habit.target) : amount)} von {num(habit.target)} {habit.unit}</span> : <span>{done ? 'Erledigt' : 'Noch offen'}</span>}
          {s > 0 && <span>Serie: {s} {s === 1 ? 'Tag' : 'Tage'}</span>}
        </div>
      </button>
      {habit.target && !done && habitSteps(habit).map((step) => (
        <button key={step} type="button" className="pill-btn" onClick={() => addAmount(habit, t, step)}>+ {num(step)} {habit.unit}</button>
      ))}
      <button type="button" className={`pill-btn ${done ? 'on' : 'accent'}`} onClick={() => toggle(habit.id, t)} aria-pressed={done}>
        {done ? 'Erledigt ✓' : 'Abhaken'}
      </button>
    </li>
  );
}

const RING_NAMES = ['Äußerer Ring', 'Mittlerer Ring', 'Innerer Ring'];
const SOURCE_HINTS = {
  learn: 'Fokus-Timer (Lernen)',
  focus: 'Fokus-Timer (alle Modi)',
  move: 'Training',
  habits: 'alle Gewohnheiten',
  tasks: 'heute erledigt',
} as const;

function RingGoalsForm() {
  const { data, updateSettings } = useStore();
  const { show } = useToast();
  const goals: RingGoals = data.settings.rings ?? defaultRingGoals();
  const set = (patch: Partial<RingGoals>) => updateSettings({ rings: { ...goals, ...patch } });
  const slots = ringSlots(goals);
  const setSlot = (i: number, slot: RingSlot) => {
    const next = slots.map((s, j) => (j === i ? slot : s));
    // Die alten Felder mitführen, damit ältere Versionen (z. B. auf einem anderen Gerät) sinnvolle Ziele sehen
    const learn = next.find((s) => s.source === 'learn');
    const move = next.find((s) => s.source === 'move');
    set({ slots: next, ...(learn ? { learnMinutes: learn.goal } : {}), ...(move ? { moveMinutes: move.goal } : {}) });
  };
  const setSource = (i: number, source: RingSource) =>
    setSlot(i, { source, goal: sourceHasGoal(source) ? (slots[i].source === source ? slots[i].goal : DEFAULT_SLOT_GOAL[source]) : 0 });
  const toggleReminder = async (on: boolean) => {
    set({ reminder: on });
    if (on && typeof Notification !== 'undefined' && Notification.permission === 'default') {
      const result = await Notification.requestPermission().catch(() => 'denied');
      if (result !== 'granted') show('Ohne Mitteilungen erinnert dich AntonOS mit einem Hinweis in der App.');
    }
  };
  return (
    <div className="form-grid">
      {slots.map((slot, i) => (
        <div key={i} className="ring-slot full">
          <label>
            <span><span className="ring-dot" style={{ background: SLOT_COLORS[i] }} /> {RING_NAMES[i]}</span>
            <select value={slot.source} onChange={(e) => setSource(i, e.target.value as RingSource)}>
              {(['learn', 'focus', 'move', 'habits', 'tasks'] as const).map((src) => <option key={src} value={src}>{SOURCE_LABELS[src]} – {SOURCE_HINTS[src]}</option>)}
              {data.habits.length > 0 && (
                <optgroup label="Einzelne Gewohnheit">
                  {data.habits.map((h) => <option key={h.id} value={`habit:${h.id}`}>{h.icon} {h.name}</option>)}
                </optgroup>
              )}
              {slot.source.startsWith('habit:') && !data.habits.some((h) => `habit:${h.id}` === slot.source) && <option value={slot.source}>Gelöschte Gewohnheit</option>}
              {i > 0 && <option value="off">Aus</option>}
            </select>
          </label>
          {sourceHasGoal(slot.source) && (
            <label>
              Ziel pro Tag ({slot.source === 'tasks' ? 'Aufgaben' : 'Minuten'})
              <input
                type="number"
                min={1}
                step={slot.source === 'tasks' ? 1 : 5}
                value={slot.goal}
                onChange={(e) => setSlot(i, { ...slot, goal: Math.max(1, Number(e.target.value) || 0) })}
              />
            </label>
          )}
        </div>
      ))}
      <label className="check">
        <input type="checkbox" checked={goals.reminder} onChange={(e) => toggleReminder(e.target.checked)} />
        Abends erinnern, wenn ein Ring offen ist
      </label>
      <label>
        Uhrzeit der Erinnerung
        <input type="time" value={goals.reminderTime} disabled={!goals.reminder} onChange={(e) => e.target.value && set({ reminderTime: e.target.value })} />
      </label>
      <p className="muted small full">
        Lernen und Fokuszeit kommen automatisch aus dem Fokus-Timer, Bewegung aus erledigten Trainings (ohne Dauer zählt ein Training mit 30 Minuten),
        Aufgaben aus heute erledigten Aufgaben. Eine einzelne Gewohnheit nutzt ihr eigenes Tagesziel. Die Erinnerung kommt, solange AntonOS geöffnet ist.
      </p>
    </div>
  );
}

function Awards() {
  const { data } = useStore();
  const list = awards(data, data.settings.rings ?? defaultRingGoals(), today());
  return (
    <div className="awards">
      {list.map((a) => (
        <div key={a.id} className={`award ${a.earned ? 'earned' : ''}`} title={a.description}>
          <span className="award-medal" aria-hidden>{a.icon}</span>
          <strong>{a.label}</strong>
          <span className="muted small">{a.earned ? 'Erreicht' : `${Math.round(a.progress * 100)} %`}</span>
        </div>
      ))}
    </div>
  );
}

/** Neue Gewohnheit anlegen oder eine bestehende bearbeiten */
function HabitSheet({ habit, onClose }: { habit?: Habit; onClose: () => void }) {
  const { add, update, remove } = useStore();
  const [name, setName] = useState(habit?.name ?? '');
  const [icon, setIcon] = useState(habit?.icon ?? '✨');
  const [target, setTarget] = useState(habit?.target ? num(habit.target) : '');
  const [unit, setUnit] = useState(habit?.unit ?? '');
  const [amounts, setAmounts] = useState(habit?.target ? formatAmounts(habitSteps(habit)) : '');
  const goal = Number(target.replace(',', '.'));

  const save = () => {
    const steps = parseAmounts(amounts);
    const fields: Partial<Habit> = {
      name: name.trim(),
      icon: icon.trim() || '✨',
      ...(goal > 0
        ? { target: goal, unit: unit.trim(), step: steps[0] ?? (goal >= 20 ? 5 : goal >= 4 ? 1 : goal / 4), steps: steps.length ? steps : undefined }
        : { target: undefined, unit: undefined, step: undefined, steps: undefined }),
    };
    if (habit) update('habits', habit.id, fields);
    else add('habits', fields as Omit<Habit, 'id'>);
    onClose();
  };

  return (
    <Sheet title={habit ? 'Gewohnheit bearbeiten' : 'Neue Gewohnheit'} onClose={onClose} submitLabel={habit ? 'Sichern' : 'Hinzufügen'} submitDisabled={!name.trim()} onSubmit={save}>
      <div className="row">
        <label className="narrow-label">Symbol<input className="narrow" value={icon} onChange={(e) => setIcon(e.target.value)} maxLength={4} /></label>
        <label className="grow">Gewohnheit<input autoFocus={!habit} placeholder="z. B. 10 Minuten meditieren" value={name} onChange={(e) => setName(e.target.value)} /></label>
      </div>
      <div className="emoji-picks" role="group" aria-label="Symbol wählen">
        {['✨', '🧘', '📖', '💧', '🏃', '🥗', '😴', '📝', '🎸', '🧹', '💊', '🚭'].map((x) => (
          <button key={x} type="button" className={icon === x ? 'on' : ''} onClick={() => setIcon(x)}>{x}</button>
        ))}
      </div>
      <p className="muted small">Optional als Menge mit Tagesziel – dann gibt es „+“-Knöpfe (z. B. 2 l Wasser, 20 Seiten).</p>
      <div className="modal-grid">
        <label>Tagesziel<input inputMode="decimal" placeholder="z. B. 2" value={target} onChange={(e) => setTarget(e.target.value)} /></label>
        <label>Einheit<input placeholder="z. B. l, Seiten" value={unit} onChange={(e) => setUnit(e.target.value)} /></label>
      </div>
      {goal > 0 && (
        <label>
          Mengen zum Hinzufügen
          <input inputMode="decimal" placeholder="z. B. 0,2; 0,5" value={amounts} onChange={(e) => setAmounts(e.target.value)} />
          <span className="muted small">Mehrere mit Semikolon trennen – für jede gibt es einen eigenen Knopf. Leer lassen für einen passenden Schritt.</span>
        </label>
      )}
      {habit && (
        <button type="button" className="danger" onClick={() => { if (confirm(`„${habit.name}“ mit Verlauf löschen?`)) { remove('habits', habit.id); onClose(); } }}>
          Gewohnheit löschen
        </button>
      )}
    </Sheet>
  );
}

export function Habits() {
  const { data, remove } = useStore();
  const toggle = useToggleHabit();
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState<ID | null>(null);
  const editing = data.habits.find((h) => h.id === editingId);
  const t = today();
  const week = Array.from({ length: 7 }, (_, i) => addDays(t, i - 6));

  return (
    <>
      <PageHeader title="Gewohnheiten" subtitle="Schließ jeden Tag deine Ringe" actions={<AddButton label="Neue Gewohnheit" onClick={() => setAdding(true)} />} />
      <RingsCard />
      <div className="grid-2">
        <Panel title="Heute">
          {data.habits.length === 0 ? <Empty>Noch keine Gewohnheiten.</Empty> : (
            <ul className="list habit-rows">{data.habits.map((h) => <HabitRow key={h.id} habit={h} onEdit={() => setEditingId(h.id)} />)}</ul>
          )}
        </Panel>
        <Panel title="Auszeichnungen"><Awards /></Panel>
      </div>
      {adding && <HabitSheet onClose={() => setAdding(false)} />}
      {editing && <HabitSheet habit={editing} onClose={() => setEditingId(null)} />}
      <Panel title="Letzte 7 Tage">
        {data.habits.length === 0 ? <Empty>Noch keine Gewohnheiten.</Empty> : (
          <div className="table-wrap">
            <table className="habit-table">
              <thead>
                <tr>
                  <th />
                  {week.map((d) => (
                    <th key={d} className={d === t ? 'today' : ''}>
                      {parseDate(d).toLocaleDateString('de-DE', { weekday: 'short' })}
                      <br />
                      <span className="muted small">{Number(d.slice(8))}.</span>
                    </th>
                  ))}
                  <th>Serie</th>
                  <th>30 Tage</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {data.habits.map((h) => (
                  <tr key={h.id}>
                    <td className="habit-name">{h.icon} {h.name}{h.target ? <span className="muted small"> · {num(h.target)} {h.unit}</span> : null}</td>
                    {week.map((d) => (
                      <td key={d}>
                        <input type="checkbox" checked={isHabitDone(data.habitLogs, h, d)} onChange={() => toggle(h.id, d)} aria-label={`${h.name} am ${d}`} />
                      </td>
                    ))}
                    <td>🔥 {streak(data.habitLogs, h, t)}</td>
                    <td>{Math.round(completionRate(data.habitLogs, h, t))} %</td>
                    <td>
                      <button className="icon" onClick={() => confirm(`„${h.name}“ mit Verlauf löschen?`) && remove('habits', h.id)} aria-label="Löschen" title="Löschen">×</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
      <Panel title="⭕ Ringe einstellen"><RingGoalsForm /></Panel>
    </>
  );
}
