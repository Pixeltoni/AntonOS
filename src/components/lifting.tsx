import { useEffect, useMemo, useState } from 'react';
import { newId, useStore } from '../store';
import type { DateStr, ExerciseLog, ID, PlanExercise, SetLog, TrainingDay, Workout } from '../types';
import { formatDate, relativeLabel, today } from '../lib/dates';
import {
  bestSet, buildPlan, buildSeparateDay, compareSets, dayTargetSummary, describeComparison, describeTarget, exerciseHistory, formatNumber,
  formatSets, formatTarget, isRepsOnly, lastSessionOf, nextTrainingDay, parseNumber, previousEntry, removeSeriesFrom, setText, targetFor, timedExercise,
  totalReps, volume, withoutWeight, type ExerciseEntry, type NextTarget,
} from '../lib/training';
import { DEFAULT_REST, doneSets, minutesSince, nextOpenSet, parseDraft, REST_CHOICES, setLabel, type DraftSet, type WorkoutDraft } from '../lib/rest';
import { success, tap } from '../lib/haptics';
import { Empty } from './ui';
import { Sheet } from './sheet';
import { RestBar, useNow, useRest } from './rest';
import { useToast } from './toast';

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

type SetDraft = DraftSet;
type RowDraft = {
  exerciseId: ID;
  name: string;
  target: string;
  prev: ExerciseEntry | null;
  /** Ziel für heute (nur bei neuen Trainings) */
  goal: NextTarget | null;
  timed: boolean;
  sets: SetDraft[];
};

const DRAFT_KEY = 'antonos:training-entwurf';

/** Laufendes Training von heute (optional nur für einen Plan-Tag) */
export function readDraft(dayId?: ID): WorkoutDraft | null {
  try {
    const d = parseDraft(JSON.parse(localStorage.getItem(DRAFT_KEY) ?? 'null'));
    return d && d.date === today() && (!dayId || d.dayId === dayId) ? d : null;
  } catch {
    return null;
  }
}

function writeDraft(d: WorkoutDraft | null) {
  try {
    if (d) localStorage.setItem(DRAFT_KEY, JSON.stringify(d));
    else localStorage.removeItem(DRAFT_KEY);
  } catch {
    // dann eben ohne Entwurf
  }
}

const toSets = (sets: SetDraft[], repsOnly = false): SetLog[] =>
  sets.map((s) => ({ weight: repsOnly ? 0 : parseNumber(s.w) ?? 0, reps: Math.round(parseNumber(s.r) ?? 0) })).filter((s) => s.reps > 0);

/** Letztes Mal – bei Tagen nur mit Wiederholungen ohne Gewicht */
function prevFor(workouts: Workout[], id: ID, name: string, date: DateStr, skip: ID | undefined, repsOnly: boolean): ExerciseEntry | null {
  const prev = previousEntry(workouts, id, name, date, skip);
  return prev && repsOnly ? { ...prev, sets: withoutWeight(prev.sets) } : prev;
}

function buildRows(day: TrainingDay | undefined, workout: Workout | undefined, workouts: Workout[], date: DateStr): RowDraft[] {
  const logged = workout?.exercises ?? [];
  const repsOnly = isRepsOnly(day);
  const planned: { ex?: PlanExercise; id: ID; name: string; target: string; count: number }[] = (day?.exercises ?? []).map((e) => ({ ex: e, id: e.id, name: e.name, target: `${e.sets} × ${e.reps || '–'}`, count: e.sets }));
  // Beim Bearbeiten auch Übungen zeigen, die inzwischen aus dem Plan entfernt wurden
  for (const l of logged) if (!planned.some((p) => p.id === l.exerciseId)) planned.push({ id: l.exerciseId, name: l.name, target: '', count: l.sets.length });
  return planned.map((p) => {
    const prev = prevFor(workouts, p.id, p.name, date, workout?.id, repsOnly);
    const own = logged.find((l) => l.exerciseId === p.id);
    const goal = !workout && p.ex ? targetFor(workouts, p.ex, date, undefined, repsOnly) : null;
    const sets: SetDraft[] = own
      ? own.sets.map((s) => ({ w: repsOnly ? '' : formatNumber(s.weight), r: String(s.reps) }))
      : goal
        // Neu mit Ziel: Zielgewicht vorbelegen, Ziel-Wiederholungen nur als Vorschlag (grau)
        ? goal.reps.map(() => ({ w: goal.weight > 0 ? formatNumber(goal.weight) : '', r: '' }))
        // Ohne Ziel: Gewicht vom letzten Mal vorbelegen
        : Array.from({ length: Math.max(1, prev?.sets.length ?? p.count) }, (_, i) => {
            const last = prev?.sets[Math.min(i, (prev?.sets.length ?? 1) - 1)];
            return { w: last && last.weight > 0 ? formatNumber(last.weight) : '', r: '' };
          });
    return { exerciseId: p.id, name: p.name, target: p.target, prev, goal, timed: timedExercise({ name: p.name, reps: p.ex?.reps }), sets };
  });
}

/** Grauer Vorschlag für einen Satz: das Ziel, sonst der Satz vom letzten Mal */
function hintFor(r: RowDraft, k: number): SetLog | null {
  if (r.goal) return { weight: r.goal.weight, reps: r.goal.reps[Math.min(k, r.goal.reps.length - 1)] };
  const sets = r.prev?.sets ?? [];
  return sets.length ? sets[Math.min(k, sets.length - 1)] : null;
}

export function LogSheet({ day, workout, onClose }: { day?: TrainingDay; workout?: Workout; onClose: () => void }) {
  const { data, add, update, remove, updateSettings } = useStore();
  const rest = useRest();
  const { show } = useToast();
  const t = today();
  /** Neues Training von einem Plan-Tag: Sätze abhaken, Satzpause, Entwurf */
  const live = !workout && !!day;
  const [restored] = useState(() => (live ? readDraft(day!.id) : null));
  const [date, setDate] = useState<DateStr>(workout?.date ?? t);
  const [minutes, setMinutes] = useState(restored?.minutes ?? (workout?.minutes ? String(workout.minutes) : ''));
  const [notes, setNotes] = useState(restored?.notes ?? workout?.notes ?? '');
  const [startedAt, setStartedAt] = useState<number | null>(restored?.startedAt ?? null);
  const [rows, setRows] = useState<RowDraft[]>(() => {
    const built = buildRows(day, workout, data.workouts, workout?.date ?? t);
    if (!restored) return built;
    return built.map((r) => {
      const saved = restored.rows.find((x) => x.exerciseId === r.exerciseId);
      return saved && saved.sets.length ? { ...r, sets: saved.sets } : r;
    });
  });
  const name = day?.name ?? workout?.title ?? 'Training';
  /** Körpertraining & Co.: nur Wiederholungen, kein Gewicht */
  const repsOnly = isRepsOnly(day);
  const restSeconds = data.settings.restSeconds ?? DEFAULT_REST;
  const now = useNow(live && startedAt !== null, 30_000);

  // Laufendes Training merken, sobald der erste Satz abgehakt ist
  useEffect(() => {
    if (!live || startedAt === null) return;
    writeDraft({ dayId: day!.id, date, startedAt, minutes, notes, rows: rows.map((r) => ({ exerciseId: r.exerciseId, sets: r.sets })) });
  }, [live, day, date, startedAt, minutes, notes, rows]);

  // Beim Nachtragen mit anderem Datum „Letztes Mal“ neu bestimmen, eingetragene Sätze bleiben
  const changeDate = (d: DateStr) => {
    setDate(d);
    setRows((rs) => rs.map((r) => ({ ...r, prev: prevFor(data.workouts, r.exerciseId, r.name, d, workout?.id, repsOnly) })));
  };
  const setRow = (i: number, fn: (r: RowDraft) => RowDraft) => setRows((rs) => rs.map((r, j) => (j === i ? fn(r) : r)));
  const setCell = (i: number, k: number, key: 'w' | 'r', v: string) =>
    setRow(i, (r) => ({ ...r, sets: r.sets.map((s, j) => (j === k ? { ...s, [key]: v } : s)) }));
  const addSet = (i: number) => setRow(i, (r) => ({ ...r, sets: [...r.sets, { ...(r.sets[r.sets.length - 1] ?? { w: '', r: '' }), done: false }] }));
  const removeSet = (i: number, k: number) => setRow(i, (r) => ({ ...r, sets: r.sets.filter((_, j) => j !== k) }));
  const sameAsLast = (i: number) => setRow(i, (r) => (r.prev ? { ...r, sets: r.prev.sets.map((s) => ({ w: s.weight > 0 ? formatNumber(s.weight) : '', r: String(s.reps) })) } : r));

  /** Satz geschafft: leere Felder übernehmen den Vorschlag, dann startet die Satzpause */
  const toggleDone = (i: number, k: number) => {
    const row = rows[i];
    const set = row.sets[k];
    if (set.done) {
      setRow(i, (r) => ({ ...r, sets: r.sets.map((s, j) => (j === k ? { ...s, done: false } : s)) }));
      return;
    }
    const hint = hintFor(row, k);
    const w = repsOnly ? '' : set.w.trim() || (hint && hint.weight > 0 ? formatNumber(hint.weight) : '');
    const r = set.r.trim() || (hint && hint.reps > 0 ? String(hint.reps) : '');
    if (!r) {
      show(`Trag erst die ${row.timed ? 'Sekunden' : 'Wiederholungen'} für Satz ${k + 1} ein.`);
      return;
    }
    const next = rows.map((x, j) => (j === i ? { ...x, sets: x.sets.map((s, m) => (m === k ? { ...s, w, r, done: true } : s)) } : x));
    setRows(next);
    if (startedAt === null) setStartedAt(Date.now());
    const pos = nextOpenSet(next, i, k);
    if (!pos) {
      rest.skip();
      success();
      show('💪 Alle Sätze geschafft – jetzt nur noch sichern.', undefined, 5000);
      return;
    }
    tap();
    const nr = next[pos.row];
    const ns = nr.sets[pos.set];
    const nh = hintFor(nr, pos.set);
    const goalWeight = repsOnly ? 0 : parseNumber(ns.w) ?? nh?.weight ?? 0;
    const goalReps = Math.round(parseNumber(ns.r) ?? nh?.reps ?? 0);
    rest.start(restSeconds, { exercise: row.name, next: setLabel(nr.name, pos.set, nr.sets.length), goal: setText(goalWeight, goalReps, nr.timed) });
  };

  const logs: ExerciseLog[] = rows.map((r) => ({ exerciseId: r.exerciseId, name: r.name, sets: toSets(r.sets, repsOnly) })).filter((l) => l.sets.length > 0);
  const suggested = startedAt !== null ? minutesSince(startedAt, now) : null;

  const save = () => {
    const m = Number(minutes) || suggested || 0;
    const final: Omit<Workout, 'id'> = {
      title: name, type: 'Krafttraining', date, done: true, notes: notes.trim(),
      minutes: m > 0 ? m : undefined, planDayId: day?.id ?? workout?.planDayId, exercises: logs,
    };
    if (workout) update('workouts', workout.id, final);
    else add('workouts', final);
    if (live) {
      writeDraft(null);
      rest.skip();
    }
    onClose();
  };

  const discard = () => {
    if (!confirm('Laufendes Training verwerfen? Abgehakte Sätze gehen verloren.')) return;
    writeDraft(null);
    rest.skip();
    onClose();
  };

  return (
    <Sheet title={workout ? `${name} bearbeiten` : `${name} eintragen`} submitLabel="Sichern" submitDisabled={logs.length === 0} onClose={onClose} onSubmit={save}>
      {live && <RestBar />}
      <p className="muted small lift-hint">
        {repsOnly
          ? live
            ? 'Nur Wiederholungen, kein Gewicht. Tippe nach jedem Satz auf ✓: Ein leeres Feld übernimmt den grauen Vorschlag, dann startet die Satzpause.'
            : 'Nur Wiederholungen, kein Gewicht. Leere Sätze werden nicht gespeichert.'
          : live
            ? 'Tippe nach jedem Satz auf ✓: Leere Felder übernehmen den grauen Vorschlag, dann startet die Satzpause. Gewicht 0 = Körpergewicht.'
            : 'Trag pro Satz Gewicht (kg) und Wiederholungen ein. Leere Sätze werden nicht gespeichert, Gewicht 0 = Körpergewicht.'}
      </p>
      {live && (
        <div className="lift-rest-pick">
          <span className="muted small">Satzpause</span>
          <div className="segmented" role="radiogroup" aria-label="Länge der Satzpause">
            {REST_CHOICES.map((s) => (
              <button key={s} type="button" role="radio" aria-checked={restSeconds === s} className={restSeconds === s ? 'selected' : ''} onClick={() => updateSettings({ restSeconds: s })}>
                {s < 120 ? `${s} s` : `${s / 60} Min.`}
              </button>
            ))}
          </div>
        </div>
      )}
      {rows.length === 0 && <Empty>Dieser Tag hat noch keine Übungen. Füge sie unter „Plan bearbeiten“ hinzu.</Empty>}
      {rows.map((r, i) => {
        const current = toSets(r.sets, repsOnly);
        return (
          <section key={r.exerciseId} className="lift-ex">
            <div className="lift-ex-head">
              <strong>{r.name}</strong>
              {r.target && <span className="muted small">{r.target}</span>}
              {/* Beim Abhaken erst vergleichen, wenn alle Sätze der Übung stehen */}
              {r.prev && current.length > 0 && (!live || current.length === r.sets.length) && <TrendChip current={current} previous={r.prev.sets} />}
            </div>
            {r.prev ? (
              <div className="lift-last muted small">
                <span>Letztes Mal ({relativeLabel(r.prev.date, t)}): <b>{formatSets(r.prev.sets, r.timed)}</b></span>
                <button type="button" className="link" onClick={() => sameAsLast(i)}>Übernehmen</button>
              </div>
            ) : (
              <div className="lift-last muted small">Noch kein Eintrag – heute ist der Startwert.</div>
            )}
            {r.goal && (
              <div className={`lift-goal ${r.goal.kind}`}>
                <span>🎯 Ziel heute: <b>{formatTarget(r.goal, r.timed)}</b></span>
                <span className="lift-goal-tag">{describeTarget(r.goal, r.timed)}</span>
              </div>
            )}
            {r.goal?.kind === 'leichter' && (
              <p className="muted small lift-deload">Dreimal in Folge kein Fortschritt. Eine leichtere Einheit gibt dem Körper Zeit, danach geht es wieder aufwärts.</p>
            )}
            <div className="lift-sets">
              {r.sets.map((s, k) => {
                const hint = hintFor(r, k);
                return (
                  <div key={k} className={`lift-set ${live ? 'live' : ''} ${repsOnly ? 'reps-only' : ''} ${s.done ? 'done' : ''}`}>
                    <span className="lift-set-no">{k + 1}</span>
                    {!repsOnly && <input inputMode="decimal" aria-label={`${r.name} Satz ${k + 1} Gewicht`} value={s.w} placeholder={hint ? formatNumber(hint.weight) : 'kg'} onChange={(e) => setCell(i, k, 'w', e.target.value)} />}
                    {!repsOnly && <span className="muted">kg ×</span>}
                    <input inputMode="numeric" aria-label={`${r.name} Satz ${k + 1} ${r.timed ? 'Sekunden' : 'Wiederholungen'}`} value={s.r} placeholder={hint && hint.reps > 0 ? String(hint.reps) : r.timed ? 'Sek.' : 'Wdh.'} onChange={(e) => setCell(i, k, 'r', e.target.value)} />
                    {repsOnly && <span className="muted">{r.timed ? 'Sek.' : 'Wdh.'}</span>}
                    {live && (
                      <button type="button" className={`lift-done ${s.done ? 'on' : ''}`} aria-pressed={!!s.done} aria-label={`Satz ${k + 1} ${s.done ? 'wieder öffnen' : 'geschafft'}`} onClick={() => toggleDone(i, k)}>✓</button>
                    )}
                    <button type="button" className="icon lift-remove" aria-label={`Satz ${k + 1} entfernen`} onClick={() => removeSet(i, k)} disabled={r.sets.length === 1}>×</button>
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
        <label>Dauer (Min.)<input type="number" min={1} value={minutes} placeholder={suggested ? `≈ ${suggested}` : 'optional'} onChange={(e) => setMinutes(e.target.value)} /></label>
      </div>
      <label>Notiz<input value={notes} placeholder="z. B. Schulter gezwickt" onChange={(e) => setNotes(e.target.value)} /></label>
      {live && startedAt !== null && <button type="button" className="danger" onClick={discard}>Training verwerfen</button>}
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
            <button type="button" className={`lift-sep-toggle ${d.separate ? 'on' : ''}`} aria-pressed={!!d.separate} title="Separates Training zählt nicht zur Reihenfolge der anderen Tage" onClick={() => setDay(i, (x) => ({ ...x, separate: !x.separate || undefined }))}>{d.separate ? 'Separat' : 'In Reihenfolge'}</button>
            <button type="button" className={`lift-sep-toggle ${isRepsOnly(d) ? 'on' : ''}`} aria-pressed={isRepsOnly(d)} title="Nur Wiederholungen zählen, ohne Gewicht (z. B. Liegestütze)" onClick={() => setDay(i, (x) => ({ ...x, repsOnly: !isRepsOnly(x) }))}>{isRepsOnly(d) ? 'Nur Wdh.' : 'Mit Gewicht'}</button>
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
      <p className="muted small">„Separat“ heißt: eigenes Training neben der Reihenfolge. Es wird nie als Nächstes vorgeschlagen und verschiebt die anderen Tage nicht. „Nur Wdh.“ zählt nur Wiederholungen, ganz ohne Gewicht.</p>
      <button type="button" onClick={() => setPlan((p) => [...p, { id: newId(), name: 'Beine', exercises: [] }])}>+ Trainingstag</button>
      {!plan.some((d) => d.separate) && <button type="button" onClick={() => setPlan((p) => [...p, buildSeparateDay(newId)])}>+ Separates Körpertraining</button>}
    </Sheet>
  );
}

/* ---------- Fortschritt einer Übung ---------- */

function ProgressSheet({ onClose }: { onClose: () => void }) {
  const { data } = useStore();
  const all = data.trainingPlan.flatMap((d) => d.exercises.map((e) => ({ ...e, dayId: d.id })));
  const [sel, setSel] = useState<ID | undefined>(all[0]?.id);
  const ex = all.find((e) => e.id === sel);
  /** Übung aus einem Tag nur mit Wiederholungen: Fortschritt = Wiederholungen insgesamt */
  const repsOnly = isRepsOnly(data.trainingPlan.find((d) => d.id === ex?.dayId));
  const timed = !!ex && timedExercise(ex);
  const history = useMemo(() => {
    const list = ex ? exerciseHistory(data.workouts, ex.id, ex.name) : [];
    return repsOnly ? list.map((h) => ({ ...h, sets: withoutWeight(h.sets) })) : list;
  }, [ex, data.workouts, repsOnly]);
  const chart = history.slice(0, 10).reverse();
  const barValue = (sets: SetLog[]) => (repsOnly ? totalReps(sets) : bestSet(sets)?.weight ?? 0);
  const max = Math.max(1, ...chart.map((h) => barValue(h.sets)));
  const unit = timed ? 'Sek.' : 'Wdh.';
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
            <span className="health-label">{repsOnly ? `🤸 ${ex.name} · zuletzt insgesamt` : `🏋️ ${ex.name} · bester Satz`}</span>
            <span className="health-value">{repsOnly ? `${totalReps(history[0].sets)} ${unit}` : formatSets([bestSet(history[0].sets)!])}</span>
            {first && first !== history[0] && <span className="muted small">Seit {formatDate(first.date)}: <TrendChip current={history[0].sets} previous={first.sets} /></span>}
            <div className="fit-bars" aria-label={repsOnly ? 'Wiederholungen pro Training' : 'Bestes Gewicht pro Training'}>
              {chart.map((h) => {
                const v = barValue(h.sets);
                return (
                  <div key={h.workoutId} title={`${formatDate(h.date)}: ${formatSets(h.sets, timed)}`}>
                    <span style={{ height: `${(v / max) * 100}%` }} />
                    <small>{formatNumber(v)}</small>
                  </div>
                );
              })}
            </div>
          </section>
          <ul className="ios-list">
            {history.map((h, i) => (
              <li key={h.workoutId}>
                <div className="grow lift-hist">
                  <span className="task-title">{formatSets(h.sets, timed)}</span>
                  <span className="muted small">{relativeLabel(h.date, t)} · {repsOnly ? `${totalReps(h.sets)} ${unit} insgesamt` : `${formatNumber(volume(h.sets))} kg bewegt`}</span>
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
  const draft = readDraft();

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
          <p className="muted">Lege deinen Push/Pull-Split mit separatem Körpertraining an. Danach trägst du pro Training einfach Gewicht und Wiederholungen ein und siehst sofort, ob du besser bist als letztes Mal.</p>
          <button type="button" className="primary" onClick={() => mutate((d) => ({ ...d, trainingPlan: buildPlan(newId) }))}>Push/Pull-Plan + Körpertraining anlegen</button>
          <button type="button" className="link" onClick={() => setSheet({ kind: 'plan' })}>Eigenen Plan zusammenstellen</button>
        </div>
      ) : (
        <div className="lift-days">
          {!sheet && <RestBar compact />}
          {plan.map((d) => {
            const last = lastSessionOf(data.workouts, d.id);
            const running = draft?.dayId === d.id ? draft : null;
            const goals = dayTargetSummary(d, data.workouts, t);
            return (
              <button key={d.id} type="button" className={`lift-day ${next?.id === d.id ? 'next' : ''}`} style={{ ['--c' as string]: dayColor(plan, d.id) }} onClick={() => setSheet({ kind: 'log', day: d })}>
                <span className="lift-day-top">
                  <strong>{d.name}</strong>
                  {running ? <span className="lift-badge running">Läuft · {doneSets(running)} {doneSets(running) === 1 ? 'Satz' : 'Sätze'}</span> : next?.id === d.id && <span className="lift-badge">Als Nächstes</span>}
                  {d.separate && <span className="lift-badge separate">Separat</span>}
                </span>
                <span className="muted small">{d.exercises.length} Übungen · {last ? `zuletzt ${relativeLabel(last.date, t)}` : 'noch nie'}</span>
                <span className="muted small lift-day-list">{d.exercises.map((e) => e.name).join(', ')}</span>
                {goals.up.length > 0 && <span className="small lift-day-goal up">↑ Mehr Gewicht: {goals.up.join(', ')}</span>}
                {goals.lighter.length > 0 && <span className="small lift-day-goal lighter">↓ Leichtere Einheit: {goals.lighter.join(', ')}</span>}
                <span className="lift-start">{running ? 'Weiter trainieren ›' : 'Training eintragen ›'}</span>
              </button>
            );
          })}
          {!plan.some((d) => d.separate) && (
            <button type="button" className="lift-day lift-day-add" onClick={() => mutate((d) => ({ ...d, trainingPlan: [...d.trainingPlan, buildSeparateDay(newId)] }))}>
              <strong>+ Körpertraining</strong>
              <span className="muted small">Dritter Plan, separat von Push/Pull. Verschiebt die Reihenfolge nicht.</span>
            </button>
          )}
        </div>
      )}
      {sheet?.kind === 'log' && <LogSheet day={sheet.day} onClose={() => setSheet(null)} />}
      {sheet?.kind === 'plan' && <PlanSheet onClose={() => setSheet(null)} />}
      {sheet?.kind === 'progress' && <ProgressSheet onClose={() => setSheet(null)} />}
    </section>
  );
}
