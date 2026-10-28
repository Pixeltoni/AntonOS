import { useState } from 'react';
import { useStore } from '../store';
import type { DateStr, Habit, ID, RingGoals, WidgetVariant } from '../types';
import { addDays, parseDate, today } from '../lib/dates';
import { completionRate, habitAmount, isHabitDone, streak } from '../lib/life';
import { awards, defaultRingGoals, RING_COLORS } from '../lib/rings';
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

/** „+ 0,25 l“ bei Mengen-Gewohnheiten */
export function useAddAmount() {
  const { data, add, update } = useStore();
  return (habit: Habit, date: DateStr) => {
    const step = habit.step && habit.step > 0 ? habit.step : 1;
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

function HabitRow({ habit }: { habit: Habit }) {
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
      <div className="grow">
        <div className="task-title">{habit.icon} {habit.name}</div>
        <div className="meta">
          {habit.target ? <span>{num(done ? Math.max(amount, habit.target) : amount)} von {num(habit.target)} {habit.unit}</span> : <span>{done ? 'Erledigt' : 'Noch offen'}</span>}
          {s > 0 && <span>Serie: {s} {s === 1 ? 'Tag' : 'Tage'}</span>}
        </div>
      </div>
      {habit.target && !done && (
        <button type="button" className="pill-btn" onClick={() => addAmount(habit, t)}>+ {num(habit.step && habit.step > 0 ? habit.step : 1)} {habit.unit}</button>
      )}
      <button type="button" className={`pill-btn ${done ? 'on' : 'accent'}`} onClick={() => toggle(habit.id, t)} aria-pressed={done}>
        {done ? 'Erledigt ✓' : 'Abhaken'}
      </button>
    </li>
  );
}

function RingGoalsForm() {
  const { data, updateSettings } = useStore();
  const { show } = useToast();
  const goals: RingGoals = data.settings.rings ?? defaultRingGoals();
  const set = (patch: Partial<RingGoals>) => updateSettings({ rings: { ...goals, ...patch } });
  const toggleReminder = async (on: boolean) => {
    set({ reminder: on });
    if (on && typeof Notification !== 'undefined' && Notification.permission === 'default') {
      const result = await Notification.requestPermission().catch(() => 'denied');
      if (result !== 'granted') show('Ohne Mitteilungen erinnert dich AntonOS mit einem Hinweis in der App.');
    }
  };
  return (
    <div className="form-grid">
      <label>
        <span><span className="ring-dot" style={{ background: RING_COLORS.learn }} /> Lernen pro Tag (Minuten)</span>
        <input type="number" min={5} step={5} value={goals.learnMinutes} onChange={(e) => set({ learnMinutes: Math.max(5, Number(e.target.value) || 0) })} />
      </label>
      <label>
        <span><span className="ring-dot" style={{ background: RING_COLORS.move }} /> Bewegung pro Tag (Minuten)</span>
        <input type="number" min={5} step={5} value={goals.moveMinutes} onChange={(e) => set({ moveMinutes: Math.max(5, Number(e.target.value) || 0) })} />
      </label>
      <label className="check">
        <input type="checkbox" checked={goals.reminder} onChange={(e) => toggleReminder(e.target.checked)} />
        Abends erinnern, wenn ein Ring offen ist
      </label>
      <label>
        Uhrzeit der Erinnerung
        <input type="time" value={goals.reminderTime} disabled={!goals.reminder} onChange={(e) => e.target.value && set({ reminderTime: e.target.value })} />
      </label>
      <p className="muted small full">
        Lernzeit kommt automatisch aus dem Fokus-Timer, Bewegung aus erledigten Trainings (ohne Dauer zählt ein Training mit 30 Minuten).
        Die Erinnerung kommt, solange AntonOS geöffnet ist.
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

export function Habits() {
  const { data, add, remove } = useStore();
  const toggle = useToggleHabit();
  const [name, setName] = useState('');
  const [icon, setIcon] = useState('✨');
  const [target, setTarget] = useState('');
  const [unit, setUnit] = useState('');
  const [adding, setAdding] = useState(false);
  const t = today();
  const week = Array.from({ length: 7 }, (_, i) => addDays(t, i - 6));

  return (
    <>
      <PageHeader title="Gewohnheiten" subtitle="Schließ jeden Tag deine Ringe" actions={<AddButton label="Neue Gewohnheit" onClick={() => setAdding(true)} />} />
      <RingsCard />
      <div className="grid-2">
        <Panel title="Heute">
          {data.habits.length === 0 ? <Empty>Noch keine Gewohnheiten.</Empty> : (
            <ul className="list habit-rows">{data.habits.map((h) => <HabitRow key={h.id} habit={h} />)}</ul>
          )}
        </Panel>
        <Panel title="Auszeichnungen"><Awards /></Panel>
      </div>
      {adding && (
        <Sheet
          title="Neue Gewohnheit"
          onClose={() => setAdding(false)}
          submitDisabled={!name.trim()}
          onSubmit={() => {
            const goal = Number(target.replace(',', '.'));
            add('habits', {
              name: name.trim(),
              icon: icon.trim() || '✨',
              ...(goal > 0 ? { target: goal, unit: unit.trim(), step: goal >= 20 ? 5 : goal >= 4 ? 1 : goal / 4 } : {}),
            });
            setName('');
            setTarget('');
            setUnit('');
            setAdding(false);
          }}
        >
          <div className="row">
            <label className="narrow-label">Symbol<input className="narrow" value={icon} onChange={(e) => setIcon(e.target.value)} maxLength={4} /></label>
            <label className="grow">Gewohnheit<input autoFocus placeholder="z. B. 10 Minuten meditieren" value={name} onChange={(e) => setName(e.target.value)} /></label>
          </div>
          <div className="emoji-picks" role="group" aria-label="Symbol wählen">
            {['✨', '🧘', '📖', '💧', '🏃', '🥗', '😴', '📝', '🎸', '🧹', '💊', '🚭'].map((x) => (
              <button key={x} type="button" className={icon === x ? 'on' : ''} onClick={() => setIcon(x)}>{x}</button>
            ))}
          </div>
          <p className="muted small">Optional als Menge mit Tagesziel – dann gibt es einen „+“-Knopf (z. B. 2 l Wasser, 20 Seiten).</p>
          <div className="modal-grid">
            <label>Tagesziel<input inputMode="decimal" placeholder="z. B. 2" value={target} onChange={(e) => setTarget(e.target.value)} /></label>
            <label>Einheit<input placeholder="z. B. l, Seiten" value={unit} onChange={(e) => setUnit(e.target.value)} /></label>
          </div>
        </Sheet>
      )}
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
      <Panel title="⭕ Ziele & Erinnerung"><RingGoalsForm /></Panel>
    </>
  );
}
