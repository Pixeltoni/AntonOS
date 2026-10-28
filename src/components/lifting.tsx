import { useMemo, useState } from 'react';
import { newId, useStore } from '../store';
import type { DateStr, ExerciseLog, ID, PlanExercise, SetLog, TrainingDay, Workout } from '../types';
import { formatDate, relativeLabel, today } from '../lib/dates';
import {
  bestSet, buildPlan, compareSets, describeComparison, exerciseHistory, formatNumber, formatSets,
  lastSessionOf, nextTrainingDay, parseNumber, previousEntry, removeSeriesFrom, volume, type ExerciseEntry,
} from '../lib/training';
import { Empty } from './ui';
import { Sheet } from './sheet';

const DAY_COLORS = ['#FF3B30', '#007AFF', '#34C759', '#FF9500', '#AF52DE'];
export const dayColor = (plan: TrainingDay[], id?: ID) => DAY_COLORS[Math.max(0, plan.findIndex((d) => d.id === id)) % DAY_COLORS.length];

/** Kleines Kärtchen „↑ +2,5 kg“ für den Vergleich mit dem letzten Mal */
function TrendChip({ current, previous }: { current: SetLog[]; previous: SetLog[] }) {
  const c = compareSets(current, previous);
  if (!c) return null;
  const arrow = c.trend === 'besser' ? '↑' : c.trend === 'schlechter' ? '↓' : '=';
  return <span className={`lift-trend ${c.trend}`} title={`Bewegtes Gewicht: ${c.volume >= 0 ? '+' : '−'}${formatNumber(Math.abs(c.volume))} kg`}>{arrow} {describeComparison(c)}</span>;
}

/* ---------- Training eintragen ---------- */

type SetDraft = { w: string; r: string };
type RowDraft = { exerciseId: ID; name: string; target: string; prev: ExerciseEntry | null; sets: SetDraft[] };

const toSets = (sets: SetDraft[]): SetLog[] =>
  sets.map((s) => ({ weight: parseNumber(s.w) ?? 0, reps: Math.round(parseNumber(s.r) ?? 0) })).filter((s) => s.reps > 0);

function buildRows(day: TrainingDay | undefined, workout: Workout | undefined, workouts: Workout[], date: DateStr): RowDraft[] {
  const logged = workout?.exercises ?? [];
  const planned: { id: ID; name: string; target: string; count: number }[] = (day?.exercises ?? []).map((e) => ({ id: e.id, name: e.name, target: `${e.sets} × ${e.reps || '–'}`, count: e.sets }));
  // Beim Bearbeiten auch Übungen zeigen, die inzwischen aus dem Plan entfernt wurden
  for (const l of logged) if (!planned.some((p) => p.id === l.exerciseId)) planned.push({ id: l.exerciseId, name: l.name, target: '', count: l.sets.length });
  return planned.map((p) => {
    const prev = previousEntry(workouts, p.id, p.name, date, workout?.id);
    const own = logged.find((l) => l.exerciseId === p.id);
    const sets: SetDraft[] = own
      ? own.sets.map((s) => ({ w: formatNumber(s.weight), r: String(s.reps) }))
      // Neu: Gewicht vom letzten Mal vorbelegen, Wiederholungen nur als Vorschlag (grau)
      : Array.from({ length: Math.max(1, prev?.sets.length ?? p.count) }, (_, i) => {
          const last = prev?.sets[Math.min(i, (prev?.sets.length ?? 1) - 1)];
          return { w: last && last.weight > 0 ? formatNumber(last.weight) : '', r: '' };
        });
    return { exerciseId: p.id, name: p.name, target: p.target, prev, sets };
  });
}

export function LogSheet({ day, workout, onClose }: { day?: TrainingDay; workout?: Workout; onClose: () => void }) {
  const { data, add, update, remove } = useStore();
  const t = today();
  const [date, setDate] = useState<DateStr>(workout?.date ?? t);
  const [minutes, setMinutes] = useState(workout?.minutes ? String(workout.minutes) : '');
  const [notes, setNotes] = useState(workout?.notes ?? '');
  const [rows, setRows] = useState<RowDraft[]>(() => buildRows(day, workout, data.workouts, workout?.date ?? t));
  const name = day?.name ?? workout?.title ?? 'Training';

  // Beim Nachtragen mit anderem Datum „Letztes Mal“ neu bestimmen, eingetragene Sätze bleiben
  const changeDate = (d: DateStr) => {
    setDate(d);
    setRows((rs) => rs.map((r) => ({ ...r, prev: previousEntry(data.workouts, r.exerciseId, r.name, d, workout?.id) })));
  };
  const setRow = (i: number, fn: (r: RowDraft) => RowDraft) => setRows((rs) => rs.map((r, j) => (j === i ? fn(r) : r)));
  const setCell = (i: number, k: number, key: keyof SetDraft, v: string) =>
    setRow(i, (r) => ({ ...r, sets: r.sets.map((s, j) => (j === k ? { ...s, [key]: v } : s)) }));
  const addSet = (i: number) => setRow(i, (r) => ({ ...r, sets: [...r.sets, { ...(r.sets[r.sets.length - 1] ?? { w: '', r: '' }) }] }));
  const removeSet = (i: number, k: number) => setRow(i, (r) => ({ ...r, sets: r.sets.filter((_, j) => j !== k) }));
  const sameAsLast = (i: number) => setRow(i, (r) => (r.prev ? { ...r, sets: r.prev.sets.map((s) => ({ w: s.weight > 0 ? formatNumber(s.weight) : '', r: String(s.reps) })) } : r));

  const logs: ExerciseLog[] = rows.map((r) => ({ exerciseId: r.exerciseId, name: r.name, sets: toSets(r.sets) })).filter((l) => l.sets.length > 0);

  const save = () => {
    const m = Number(minutes);
    const final: Omit<Workout, 'id'> = {
      title: name, type: 'Krafttraining', date, done: true, notes: notes.trim(),
      minutes: m > 0 ? m : undefined, planDayId: day?.id ?? workout?.planDayId, exercises: logs,
    };
    if (workout) update('workouts', workout.id, final);
    else add('workouts', final);
    onClose();
  };

  return (
    <Sheet title={workout ? `${name} bearbeiten` : `${name} eintragen`} submitLabel="Sichern" submitDisabled={logs.length === 0} onClose={onClose} onSubmit={save}>
      <p className="muted small lift-hint">Trag pro Satz Gewicht (kg) und Wiederholungen ein. Leere Sätze werden nicht gespeichert, Gewicht 0 = Körpergewicht.</p>
      {rows.length === 0 && <Empty>Dieser Tag hat noch keine Übungen. Füge sie unter „Plan bearbeiten“ hinzu.</Empty>}
      {rows.map((r, i) => {
        const current = toSets(r.sets);
        return (
          <section key={r.exerciseId} className="lift-ex">
            <div className="lift-ex-head">
              <strong>{r.name}</strong>
              {r.target && <span className="muted small">{r.target}</span>}
              {r.prev && current.length > 0 && <TrendChip current={current} previous={r.prev.sets} />}
            </div>
            {r.prev ? (
              <div className="lift-last muted small">
                <span>Letztes Mal ({relativeLabel(r.prev.date, t)}): <b>{formatSets(r.prev.sets)}</b></span>
                <button type="button" className="link" onClick={() => sameAsLast(i)}>Übernehmen</button>
              </div>
            ) : (
              <div className="lift-last muted small">Noch kein Eintrag – heute ist der Startwert.</div>
            )}
            <div className="lift-sets">
              {r.sets.map((s, k) => {
                const last = r.prev?.sets[k];
                return (
                  <div key={k} className="lift-set">
                    <span className="lift-set-no">{k + 1}</span>
                    <input inputMode="decimal" aria-label={`${r.name} Satz ${k + 1} Gewicht`} value={s.w} placeholder={last ? formatNumber(last.weight) : 'kg'} onChange={(e) => setCell(i, k, 'w', e.target.value)} />
                    <span className="muted">kg ×</span>
                    <input inputMode="numeric" aria-label={`${r.name} Satz ${k + 1} Wiederholungen`} value={s.r} placeholder={last ? String(last.reps) : 'Wdh.'} onChange={(e) => setCell(i, k, 'r', e.target.value)} />
                    <button type="button" className="icon" aria-label={`Satz ${k + 1} entfernen`} onClick={() => removeSet(i, k)} disabled={r.sets.length === 1}>×</button>
                  </div>
                );
              })}
            </div>
            <button type="button" className="link lift-add-set" onClick={() => addSet(i)}>+ Satz</button>
          </section>
        );
      })}
      <div className="modal-grid">
        <label>Datum<input type="date" value={date} onChange={(e) => e.target.value && changeDate(e.target.value)} /></label>
        <label>Dauer (Min.)<input type="number" min={1} value={minutes} placeholder="optional" onChange={(e) => setMinutes(e.target.value)} /></label>
      </div>
      <label>Notiz<input value={notes} placeholder="z. B. Schulter gezwickt" onChange={(e) => setNotes(e.target.value)} /></label>
      {workout && <button type="button" className="danger" onClick={() => { if (confirm('Training löschen?')) { remove('workouts', workout.id); onClose(); } }}>Training löschen</button>}
      {workout && <DeleteSeriesButton workout={workout} onDone={onClose} />}
    </Sheet>
  );
}

/** Knopf „Alle künftigen Termine dieser Serie löschen“ */
export function DeleteSeriesButton({ workout, onDone }: { workout: Workout; onDone: () => void }) {
  const { data, mutate } = useStore();
  if (!workout.seriesId) return null;
  const count = data.workouts.length - removeSeriesFrom(data.workouts, workout.seriesId, workout.date).length;
  if (count < 2) return null;
  return (
    <button type="button" className="danger" onClick={() => {
      if (!confirm(`${count} offene Termine dieser Serie ab ${formatDate(workout.date)} löschen?`)) return;
      mutate((d) => ({ ...d, workouts: removeSeriesFrom(d.workouts, workout.seriesId!, workout.date) }));
      onDone();
    }}>Diesen und alle folgenden Termine löschen ({count})</button>
  );
}

/* ---------- Plan bearbeiten ---------- */

function PlanSheet({ onClose }: { onClose: () => void }) {
  const { data, mutate } = useStore();
  const [plan, setPlan] = useState<TrainingDay[]>(() => (data.trainingPlan.length ? data.trainingPlan : buildPlan(newId)).map((d) => ({ ...d, exercises: d.exercises.map((e) => ({ ...e })) })));
  const setDay = (i: number, fn: (d: TrainingDay) => TrainingDay) => setPlan((p) => p.map((d, j) => (j === i ? fn(d) : d)));
  const setEx = (i: number, k: number, patch: Partial<PlanExercise>) => setDay(i, (d) => ({ ...d, exercises: d.exercises.map((e, j) => (j === k ? { ...e, ...patch } : e)) }));
  const move = (i: number, k: number, dir: -1 | 1) => setDay(i, (d) => {
    const ex = [...d.exercises];
    const to = k + dir;
    if (to < 0 || to >= ex.length) return d;
    [ex[k], ex[to]] = [ex[to], ex[k]];
    return { ...d, exercises: ex };
  });

  const save = () => {
    const clean = plan
      .map((d) => ({ ...d, name: d.name.trim() || 'Training', exercises: d.exercises.filter((e) => e.name.trim()).map((e) => ({ ...e, name: e.name.trim(), sets: Math.max(1, Math.round(e.sets) || 3), reps: e.reps?.trim() || undefined })) }));
    mutate((d) => ({ ...d, trainingPlan: clean }));
    onClose();
  };

  return (
    <Sheet title="Trainingsplan" submitLabel="Sichern" onClose={onClose} onSubmit={save}>
      {plan.map((d, i) => (
        <section key={d.id} className="lift-ex" style={{ ['--c' as string]: DAY_COLORS[i % DAY_COLORS.length] }}>
          <div className="lift-plan-day">
            <input className="lift-day-name" aria-label="Name des Tages" value={d.name} onChange={(e) => setDay(i, (x) => ({ ...x, name: e.target.value }))} />
            <button type="button" className="icon" aria-label={`${d.name} löschen`} onClick={() => { if (confirm(`„${d.name}“ aus dem Plan löschen? Eingetragene Trainings bleiben erhalten.`)) setPlan((p) => p.filter((_, j) => j !== i)); }}>🗑</button>
          </div>
          {d.exercises.map((e, k) => (
            <div key={e.id} className="lift-plan-ex">
              <input aria-label="Übung" value={e.name} placeholder="Übung" onChange={(ev) => setEx(i, k, { name: ev.target.value })} />
              <input aria-label="Sätze" inputMode="numeric" value={String(e.sets)} onChange={(ev) => setEx(i, k, { sets: Number(ev.target.value.replace(/\D/g, '')) })} />
              <span className="muted">×</span>
              <input aria-label="Wiederholungen" value={e.reps ?? ''} placeholder="8–12" onChange={(ev) => setEx(i, k, { reps: ev.target.value })} />
              <button type="button" className="icon" aria-label="Nach oben" onClick={() => move(i, k, -1)} disabled={k === 0}>↑</button>
              <button type="button" className="icon" aria-label={`${e.name} entfernen`} onClick={() => setDay(i, (x) => ({ ...x, exercises: x.exercises.filter((_, j) => j !== k) }))}>×</button>
            </div>
          ))}
          <button type="button" className="link lift-add-set" onClick={() => setDay(i, (x) => ({ ...x, exercises: [...x.exercises, { id: newId(), name: '', sets: 3, reps: '8–12' }] }))}>+ Übung</button>
        </section>
      ))}
      <button type="button" onClick={() => setPlan((p) => [...p, { id: newId(), name: 'Beine', exercises: [] }])}>+ Trainingstag</button>
    </Sheet>
  );
}

/* ---------- Fortschritt einer Übung ---------- */

function ProgressSheet({ onClose }: { onClose: () => void }) {
  const { data } = useStore();
  const all = data.trainingPlan.flatMap((d) => d.exercises.map((e) => ({ ...e, dayId: d.id })));
  const [sel, setSel] = useState<ID | undefined>(all[0]?.id);
  const ex = all.find((e) => e.id === sel);
  const history = useMemo(() => (ex ? exerciseHistory(data.workouts, ex.id, ex.name) : []), [ex, data.workouts]);
  const chart = history.slice(0, 10).reverse();
  const max = Math.max(1, ...chart.map((h) => bestSet(h.sets)?.weight ?? 0));
  const first = history[history.length - 1];
  const t = today();

  return (
    <Sheet title="Fortschritt" onClose={onClose}>
      <div className="type-chips" role="radiogroup" aria-label="Übung">
        {all.map((e) => (
          <button key={e.id} type="button" role="radio" aria-checked={sel === e.id} className={sel === e.id ? 'on' : ''} style={{ ['--c' as string]: dayColor(data.trainingPlan, e.dayId) }} onClick={() => setSel(e.id)}>
            {e.name}
          </button>
        ))}
      </div>
      {!ex ? <Empty>Noch keine Übungen im Plan.</Empty> : history.length === 0 ? <Empty>Für {ex.name} ist noch nichts eingetragen.</Empty> : (
        <>
          <section className="health-tile" style={{ ['--h' as string]: '#FF3B30' }}>
            <span className="health-label">🏋️ {ex.name} · bester Satz</span>
            <span className="health-value">{formatSets([bestSet(history[0].sets)!])}</span>
            {first && first !== history[0] && <span className="muted small">Seit {formatDate(first.date)}: <TrendChip current={history[0].sets} previous={first.sets} /></span>}
            <div className="fit-bars" aria-label="Bestes Gewicht pro Training">
              {chart.map((h) => {
                const b = bestSet(h.sets)!;
                return (
                  <div key={h.workoutId} title={`${formatDate(h.date)}: ${formatSets(h.sets)}`}>
                    <span style={{ height: `${(b.weight / max) * 100}%` }} />
                    <small>{formatNumber(b.weight)}</small>
                  </div>
                );
              })}
            </div>
          </section>
          <ul className="ios-list">
            {history.map((h, i) => (
              <li key={h.workoutId}>
                <div className="grow lift-hist">
                  <span className="task-title">{formatSets(h.sets)}</span>
                  <span className="muted small">{relativeLabel(h.date, t)} · {formatNumber(volume(h.sets))} kg bewegt</span>
                </div>
                {history[i + 1] && <TrendChip current={h.sets} previous={history[i + 1].sets} />}
              </li>
            ))}
          </ul>
        </>
      )}
    </Sheet>
  );
}

/* ---------- Panel auf der Trainingsseite ---------- */

export function TrainingPlanPanel() {
  const { data, mutate } = useStore();
  const [sheet, setSheet] = useState<null | { kind: 'log'; day: TrainingDay } | { kind: 'plan' } | { kind: 'progress' }>(null);
  const plan = data.trainingPlan;
  const next = nextTrainingDay(plan, data.workouts);
  const t = today();

  return (
    <section className="panel lift-panel">
      <div className="panel-head">
        <h2>Trainingsplan</h2>
        {plan.length > 0 && (
          <div className="lift-actions">
            <button type="button" className="link" onClick={() => setSheet({ kind: 'progress' })}>Fortschritt</button>
            <button type="button" className="link" onClick={() => setSheet({ kind: 'plan' })}>Plan bearbeiten</button>
          </div>
        )}
      </div>
      {plan.length === 0 ? (
        <div className="lift-empty">
          <p className="muted">Lege deinen Push/Pull-Split an. Danach trägst du pro Training einfach Gewicht und Wiederholungen ein und siehst sofort, ob du besser bist als letztes Mal.</p>
          <button type="button" className="primary" onClick={() => mutate((d) => ({ ...d, trainingPlan: buildPlan(newId) }))}>Push/Pull-Plan anlegen</button>
          <button type="button" className="link" onClick={() => setSheet({ kind: 'plan' })}>Eigenen Plan zusammenstellen</button>
        </div>
      ) : (
        <div className="lift-days">
          {plan.map((d) => {
            const last = lastSessionOf(data.workouts, d.id);
            return (
              <button key={d.id} type="button" className={`lift-day ${next?.id === d.id ? 'next' : ''}`} style={{ ['--c' as string]: dayColor(plan, d.id) }} onClick={() => setSheet({ kind: 'log', day: d })}>
                <span className="lift-day-top">
                  <strong>{d.name}</strong>
                  {next?.id === d.id && <span className="lift-badge">Als Nächstes</span>}
                </span>
                <span className="muted small">{d.exercises.length} Übungen · {last ? `zuletzt ${relativeLabel(last.date, t)}` : 'noch nie'}</span>
                <span className="muted small lift-day-list">{d.exercises.map((e) => e.name).join(', ')}</span>
                <span className="lift-start">Training eintragen ›</span>
              </button>
            );
          })}
        </div>
      )}
      {sheet?.kind === 'log' && <LogSheet day={sheet.day} onClose={() => setSheet(null)} />}
      {sheet?.kind === 'plan' && <PlanSheet onClose={() => setSheet(null)} />}
      {sheet?.kind === 'progress' && <ProgressSheet onClose={() => setSheet(null)} />}
    </section>
  );
}
