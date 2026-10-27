import { useState } from 'react';
import { useStore } from '../store';
import type { DateStr, ID, WidgetVariant } from '../types';
import { addDays, parseDate, today } from '../lib/dates';
import { completionRate, isHabitDone, streak } from '../lib/life';
import { Empty, PageHeader, Panel, Progress } from '../components/ui';

export function useToggleHabit() {
  const { data, add, remove } = useStore();
  return (habitId: ID, date: DateStr) => {
    const log = data.habitLogs.find((l) => l.habitId === habitId && l.date === date);
    if (log) remove('habitLogs', log.id);
    else add('habitLogs', { habitId, date });
  };
}

/** Checkliste für heute – wird auch auf dem Dashboard verwendet. */
export function HabitsToday({ variant = 'standard' }: { variant?: WidgetVariant }) {
  const { data } = useStore();
  const toggle = useToggleHabit();
  const t = today();
  if (data.habits.length === 0) return <Empty>Noch keine Gewohnheiten. <a href="#/gewohnheiten">Anlegen →</a></Empty>;
  const done = data.habits.filter((h) => isHabitDone(data.habitLogs, h.id, t)).length;
  const week = Array.from({ length: 7 }, (_, i) => addDays(t, i - 6));

  if (variant === 'kompakt') {
    return (
      <div className="habit-chips">
        {data.habits.map((h) => {
          const checked = isHabitDone(data.habitLogs, h.id, t);
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
          const checked = isHabitDone(data.habitLogs, h.id, t);
          return (
            <li key={h.id} className={`task ${checked ? 'done' : ''} ${variant === 'detail' ? 'wrap' : ''}`}>
              <input type="checkbox" checked={checked} onChange={() => toggle(h.id, t)} aria-label={h.name} />
              <span className="grow task-title">{h.icon} {h.name}</span>
              <span className="muted small" title="Serie">🔥 {streak(data.habitLogs, h.id, t)}</span>
              {variant === 'detail' && (
                <span className="dots" aria-label="Letzte 7 Tage">
                  {week.map((d) => <span key={d} className={isHabitDone(data.habitLogs, h.id, d) ? 'on' : ''} title={d} />)}
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

export function Habits() {
  const { data, add, remove } = useStore();
  const toggle = useToggleHabit();
  const [name, setName] = useState('');
  const [icon, setIcon] = useState('✨');
  const t = today();
  const week = Array.from({ length: 7 }, (_, i) => addDays(t, i - 6));

  return (
    <>
      <PageHeader title="Gewohnheiten" subtitle="Kleine Dinge, jeden Tag" />
      <Panel title="Neue Gewohnheit">
        <form
          className="inline-form"
          onSubmit={(e) => {
            e.preventDefault();
            if (!name.trim()) return;
            add('habits', { name: name.trim(), icon: icon.trim() || '✨' });
            setName('');
          }}
        >
          <input className="narrow" value={icon} onChange={(e) => setIcon(e.target.value)} aria-label="Emoji" maxLength={4} />
          <input className="grow" placeholder="z. B. 10 Minuten meditieren" value={name} onChange={(e) => setName(e.target.value)} aria-label="Gewohnheit" />
          <button className="primary" type="submit">Hinzufügen</button>
        </form>
      </Panel>
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
                    <td className="habit-name">{h.icon} {h.name}</td>
                    {week.map((d) => (
                      <td key={d}>
                        <input type="checkbox" checked={isHabitDone(data.habitLogs, h.id, d)} onChange={() => toggle(h.id, d)} aria-label={`${h.name} am ${d}`} />
                      </td>
                    ))}
                    <td>🔥 {streak(data.habitLogs, h.id, t)}</td>
                    <td>{Math.round(completionRate(data.habitLogs, h.id, t))} %</td>
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
    </>
  );
}
