import { useEffect, useState } from 'react';
import { Pencil } from 'lucide-react';
import { newId, useStore } from '../store';
import type { ID, Routine, RoutineStep } from '../types';
import { addDays, parseDate, today } from '../lib/dates';
import { matchHabit, ranToday, ROUTINE_COLORS, ROUTINE_TEMPLATES, routineMinutes, routineStreak, fromTemplate, type RoutineTemplate } from '../lib/routines';
import { tap } from '../lib/haptics';
import { AddButton, Sheet } from '../components/sheet';
import { PageHeader, Panel } from '../components/ui';
import { useToast } from '../components/toast';
import { useRoutine } from '../components/routine';

const minutesLabel = (m: number) => `${m.toLocaleString('de-DE', { maximumFractionDigits: 1 })} Min.`;
const WHEN_LABELS: Record<NonNullable<Routine['when']>, string> = { morgen: 'Morgens', tag: 'Tagsüber', abend: 'Abends' };
const WHEN_ICONS: Record<NonNullable<Routine['when']>, string> = { morgen: '🌅', tag: '☀️', abend: '🌙' };

/** Startknopf bzw. „läuft gerade“ */
function StartButton({ routine }: { routine: Routine }) {
  const { run, start } = useRoutine();
  const here = run?.routineId === routine.id;
  if (!routine.steps.length) return <button type="button" className="rt-start" disabled>Noch keine Schritte</button>;
  return (
    <button type="button" className={`rt-start ${here ? 'running' : ''}`} onClick={() => start(routine.id)}>
      {here ? `Läuft · Schritt ${run.index + 1} von ${routine.steps.length} – öffnen` : `▶ Starten · ${minutesLabel(routineMinutes(routine))}`}
    </button>
  );
}

function RoutineCard({ routine, onEdit }: { routine: Routine; onEdit: () => void }) {
  const { data } = useStore();
  const t = today();
  const streak = routineStreak(routine, t);
  const total = routineMinutes(routine);
  const alarm = routine.alarmId ? data.alarms.find((a) => a.id === routine.alarmId) : undefined;
  const place = routine.placeId ? (data.settings.places ?? []).find((p) => p.id === routine.placeId) : undefined;
  const habits = new Map(data.habits.map((h) => [h.id, h]));
  const week = Array.from({ length: 7 }, (_, i) => addDays(t, i - 6));
  const runs = routine.runs ?? [];
  const recent = runs.slice(-7);
  const avg = recent.length ? Math.round(recent.reduce((s, r) => s + r.minutes, 0) / recent.length) : 0;
  return (
    <article className={`rt-card ${ranToday(routine, t) ? 'ran' : ''}`} style={{ ['--c' as string]: routine.color }}>
      <header className="rt-card-head">
        <span className="rt-card-icon" aria-hidden>{routine.icon}</span>
        <span className="grow rt-card-title">
          <strong>{routine.name}</strong>
          <small className="muted">{routine.steps.length} {routine.steps.length === 1 ? 'Schritt' : 'Schritte'} · {minutesLabel(total)}{ranToday(routine, t) ? ' · heute ✓' : ''}</small>
        </span>
        <button type="button" className="icon rt-edit" onClick={onEdit} aria-label={`${routine.name} bearbeiten`} title="Bearbeiten"><Pencil size={16} /></button>
      </header>
      {total > 0 && (
        <div className="rt-bar" aria-hidden>
          {routine.steps.filter((s) => s.minutes > 0).map((s) => <i key={s.id} style={{ flexGrow: s.minutes }} />)}
        </div>
      )}
      <ol className="rt-step-list">
        {routine.steps.map((s) => {
          const habit = s.habitId ? habits.get(s.habitId) : undefined;
          return (
            <li key={s.id}>
              <span className="rt-step-ico" aria-hidden>{s.icon}</span>
              <span className="grow rt-step-name">{s.title}{habit && <small className="rt-step-habit" title={`hakt „${habit.name}“ ab`}>✨ {habit.name}</small>}</span>
              <span className="muted small">{s.minutes > 0 ? minutesLabel(s.minutes) : 'abhaken'}</span>
            </li>
          );
        })}
      </ol>
      {(routine.when || alarm || place) && (
        <div className="rt-triggers">
          {routine.when && <span>{WHEN_ICONS[routine.when]} {WHEN_LABELS[routine.when]} auf „Heute“</span>}
          {alarm && <span>⏰ Nach dem Wecker {alarm.time}</span>}
          {place && <span>📍 Beim Ankommen: {place.name}</span>}
        </div>
      )}
      <div className="rt-stats">
        <span className="rt-week" aria-label="Letzte sieben Tage">
          {week.map((d) => {
            const ran = runs.some((r) => r.date === d);
            return <i key={d} className={ran ? 'on' : ''} title={`${parseDate(d).toLocaleDateString('de-DE', { weekday: 'long' })}${ran ? ': gemacht' : ''}`}><b>{parseDate(d).toLocaleDateString('de-DE', { weekday: 'narrow' })}</b></i>;
          })}
        </span>
        <span className="muted small">{streak > 0 ? `🔥 ${streak} ${streak === 1 ? 'Tag' : 'Tage'}` : runs.length ? 'Serie startet neu' : 'Noch nie gemacht'}{avg ? ` · Ø ${avg} Min.` : ''}</span>
      </div>
      <StartButton routine={routine} />
    </article>
  );
}

function Templates({ templates, onPick }: { templates: RoutineTemplate[]; onPick(t: RoutineTemplate): void }) {
  return (
    <div className="rt-templates">
      {templates.map((tpl) => (
        <button key={tpl.name} type="button" className="rt-template" style={{ ['--c' as string]: tpl.color }} onClick={() => onPick(tpl)}>
          <span className="rt-card-icon" aria-hidden>{tpl.icon}</span>
          <span className="grow">
            <strong>{tpl.name}</strong>
            <small className="muted">{tpl.steps.map((s) => s.icon).join(' ')} · {minutesLabel(routineMinutes(tpl))}</small>
          </span>
          <span className="rt-template-add">Übernehmen</span>
        </button>
      ))}
    </div>
  );
}

interface DraftStep extends RoutineStep {
  minutesText: string;
  /** Gewohnheit von Hand gewählt – dann nicht mehr automatisch zuordnen */
  touched: boolean;
}

const blankStep = (): DraftStep => ({ id: newId(), title: '', icon: '•', minutes: 5, minutesText: '5', habitId: null, touched: false });

function parseMinutes(text: string): number {
  const n = Number(text.replace(',', '.'));
  if (!Number.isFinite(n) || n <= 0) return 0;
  return Math.min(240, Math.round(n * 2) / 2);
}

const STEP_ICONS = ['💧', '🧘', '🚿', '🗓️', '🪥', '📖', '🧹', '☕️', '🏃', '💊', '📝', '🧠'];

function RoutineSheet({ routine, onClose }: { routine?: Routine; onClose: () => void }) {
  const { data, add, update, remove } = useStore();
  const [name, setName] = useState(routine?.name ?? '');
  const [icon, setIcon] = useState(routine?.icon ?? '✨');
  const [color, setColor] = useState(routine?.color ?? ROUTINE_COLORS[0]);
  const [when, setWhen] = useState<Routine['when']>(routine?.when ?? null);
  const [steps, setSteps] = useState<DraftStep[]>(() =>
    routine?.steps.length ? routine.steps.map((s) => ({ ...s, minutesText: s.minutes ? String(s.minutes).replace('.', ',') : '0', touched: true })) : [blankStep()],
  );
  const [alarmId, setAlarmId] = useState<ID>(routine?.alarmId ?? '');
  const [placeId, setPlaceId] = useState<ID>(routine?.placeId ?? '');
  const [pickFor, setPickFor] = useState<ID | null>(null);
  const places = data.settings.places ?? [];

  const change = (id: ID, patch: Partial<DraftStep>) => setSteps((list) => list.map((s) => (s.id === id ? { ...s, ...patch } : s)));
  const rename = (s: DraftStep, title: string) => change(s.id, s.touched ? { title } : { title, habitId: matchHabit(title, data.habits) });
  const move = (i: number, by: number) =>
    setSteps((list) => {
      const next = [...list];
      const [x] = next.splice(i, 1);
      next.splice(i + by, 0, x);
      return next;
    });
  const valid = steps.filter((s) => s.title.trim());
  const total = valid.reduce((sum, s) => sum + parseMinutes(s.minutesText), 0);

  const save = () => {
    const clean: RoutineStep[] = valid.map((s) => ({ id: s.id, title: s.title.trim(), icon: s.icon.trim() || '•', minutes: parseMinutes(s.minutesText), habitId: s.habitId || null }));
    const patch = { name: name.trim(), icon: icon.trim() || '✨', color, when, steps: clean, alarmId: alarmId || null, placeId: placeId || null };
    if (routine) update('routines', routine.id, patch);
    else add('routines', { ...patch, runs: [] });
    onClose();
  };

  return (
    <Sheet title={routine ? 'Routine bearbeiten' : 'Neue Routine'} onClose={onClose} submitLabel={routine ? 'Sichern' : 'Hinzufügen'} submitDisabled={!name.trim() || !valid.length} onSubmit={save}>
      <div className="row">
        <label className="narrow-label">Symbol<input className="narrow" value={icon} onChange={(e) => setIcon(e.target.value)} maxLength={4} /></label>
        <label className="grow">Name<input autoFocus={!routine} placeholder="z. B. Morgenroutine" value={name} onChange={(e) => setName(e.target.value)} /></label>
      </div>
      <div className="emoji-picks" role="group" aria-label="Symbol wählen">
        {['🌅', '🌙', '📚', '🧘', '🏃', '🛁', '🧹', '💪', '☕️', '✨'].map((x) => (
          <button key={x} type="button" className={icon === x ? 'on' : ''} onClick={() => setIcon(x)}>{x}</button>
        ))}
      </div>
      <div className="rt-colors" role="radiogroup" aria-label="Farbe">
        {ROUTINE_COLORS.map((c) => (
          <button key={c} type="button" role="radio" aria-checked={color === c} aria-label={c} className={color === c ? 'on' : ''} style={{ background: c }} onClick={() => setColor(c)} />
        ))}
      </div>

      <fieldset className="rt-edit-steps">
        <legend>Schritte <span className="muted">· zusammen {minutesLabel(total)}</span></legend>
        <ol>
          {steps.map((s, i) => (
            <li key={s.id} className="rt-edit-step">
              <div className="rt-edit-row">
                <button type="button" className="rt-edit-icon" onClick={() => setPickFor(pickFor === s.id ? null : s.id)} aria-label={`Symbol für Schritt ${i + 1}`} aria-expanded={pickFor === s.id}>{s.icon || '•'}</button>
                <input className="grow" placeholder={i === 0 ? 'z. B. Wasser trinken' : 'Nächster Schritt'} value={s.title} onChange={(e) => rename(s, e.target.value)} aria-label={`Schritt ${i + 1}`} />
                <label className="rt-edit-min">
                  <input inputMode="decimal" value={s.minutesText} onChange={(e) => change(s.id, { minutesText: e.target.value })} aria-label={`Minuten für Schritt ${i + 1}`} onFocus={(e) => e.target.select()} />
                  <span>Min.</span>
                </label>
              </div>
              {pickFor === s.id && (
                <div className="emoji-picks rt-edit-picks" role="group" aria-label="Symbol wählen">
                  {STEP_ICONS.map((x) => <button key={x} type="button" className={s.icon === x ? 'on' : ''} onClick={() => { change(s.id, { icon: x }); setPickFor(null); }}>{x}</button>)}
                  <input className="narrow" value={s.icon} onChange={(e) => change(s.id, { icon: e.target.value })} maxLength={4} aria-label="Eigenes Symbol" />
                </div>
              )}
              <div className="rt-edit-tools">
                {data.habits.length > 0 ? (
                  <select value={s.habitId ?? ''} onChange={(e) => change(s.id, { habitId: e.target.value || null, touched: true })} aria-label={`Gewohnheit für Schritt ${i + 1}`}>
                    <option value="">Keine Gewohnheit abhaken</option>
                    {data.habits.map((h) => <option key={h.id} value={h.id}>✨ {h.icon} {h.name}</option>)}
                  </select>
                ) : <span className="grow" />}
                <button type="button" className="icon" onClick={() => move(i, -1)} disabled={i === 0} aria-label={`Schritt ${i + 1} nach oben`} title="Nach oben">↑</button>
                <button type="button" className="icon" onClick={() => move(i, 1)} disabled={i === steps.length - 1} aria-label={`Schritt ${i + 1} nach unten`} title="Nach unten">↓</button>
                <button type="button" className="icon" onClick={() => setSteps((list) => (list.length > 1 ? list.filter((x) => x.id !== s.id) : [blankStep()]))} aria-label={`Schritt ${i + 1} entfernen`} title="Entfernen">×</button>
              </div>
            </li>
          ))}
        </ol>
        <button type="button" className="pill-btn" onClick={() => setSteps((list) => [...list, blankStep()])}>+ Schritt</button>
        <span className="muted small">0 Minuten = ohne Uhr, du hakst den Schritt selbst ab (z. B. „Handy weglegen“).</span>
      </fieldset>

      <label>
        Auf „Heute“ anbieten
        <span className="segmented rt-when" role="group">
          {([null, 'morgen', 'tag', 'abend'] as const).map((w) => (
            <button key={w ?? 'nie'} type="button" className={when === w ? 'selected' : ''} onClick={() => setWhen(w)}>{w ? WHEN_LABELS[w] : 'Nie'}</button>
          ))}
        </span>
      </label>
      <label>
        Startet nach dem Wecker
        {data.alarms.length ? (
          <select value={alarmId} onChange={(e) => setAlarmId(e.target.value)}>
            <option value="">Kein Wecker</option>
            {data.alarms.map((a) => <option key={a.id} value={a.id}>⏰ {a.time}{a.label ? ` · ${a.label}` : ''}{a.days.length ? '' : ' (einmalig)'}</option>)}
          </select>
        ) : <span className="muted small">Noch kein Wecker – <a href="#/wecker" onClick={onClose}>Wecker stellen</a></span>}
      </label>
      <label>
        Fragt beim Ankommen
        {places.length ? (
          <select value={placeId} onChange={(e) => setPlaceId(e.target.value)}>
            <option value="">Kein Ort</option>
            {places.map((p) => <option key={p.id} value={p.id}>📍 {p.name}</option>)}
          </select>
        ) : <span className="muted small">Orte legst du in den <a href="#/einstellungen" onClick={onClose}>Einstellungen</a> an.</span>}
        <span className="muted small">Nur in der iPhone-App: Beim Ankommen kommt eine Mitteilung, ein Tipp startet die Routine.</span>
      </label>
      {routine && (
        <button type="button" className="danger" onClick={() => { if (confirm(`„${routine.name}“ löschen?`)) { remove('routines', routine.id); onClose(); } }}>
          Routine löschen
        </button>
      )}
    </Sheet>
  );
}

export function Routines({ start }: { start: ID | null }) {
  const { data, add } = useStore();
  const routine = useRoutine();
  const { show } = useToast();
  const [editing, setEditing] = useState<ID | 'neu' | null>(null);
  const edited = editing && editing !== 'neu' ? data.routines.find((r) => r.id === editing) : undefined;

  // Start über einen Link (Mitteilung beim Ankommen, Kurzbefehl): einmal starten, dann die normale Adresse
  useEffect(() => {
    if (!start) return;
    if (data.routines.some((r) => r.id === start)) routine.start(start);
    location.replace('#/routinen');
  }, [start]); // nur beim Öffnen des Links

  const pick = (tpl: RoutineTemplate) => {
    tap();
    const id = add('routines', fromTemplate(tpl, data.habits, newId));
    show(`${tpl.icon} ${tpl.name} angelegt`, { label: 'Anpassen', run: () => setEditing(id) });
  };
  const used = new Set(data.routines.map((r) => r.name));
  const templates = ROUTINE_TEMPLATES.filter((tpl) => !used.has(tpl.name));

  return (
    <>
      <PageHeader title="Routinen" subtitle="Schritt für Schritt durch Morgen, Abend und Lernen" actions={<AddButton label="Neue Routine" onClick={() => setEditing('neu')} />} />
      {data.routines.length === 0 ? (
        <Panel title="Starte mit einer Vorlage">
          <ul className="rt-intro">
            <li><span aria-hidden>⏱️</span> Ein großer Ring zählt jeden Schritt herunter.</li>
            <li><span aria-hidden>📳</span> Ton und Vibration melden den nächsten – in der iPhone-App auch gesperrt, mit Live-Aktivität.</li>
            <li><span aria-hidden>✨</span> Passende Gewohnheiten haken sich selbst ab.</li>
          </ul>
          <Templates templates={ROUTINE_TEMPLATES} onPick={pick} />
          <button type="button" className="pill-btn" onClick={() => setEditing('neu')}>Eigene Routine bauen</button>
        </Panel>
      ) : (
        <div className="rt-grid">
          {data.routines.map((r) => <RoutineCard key={r.id} routine={r} onEdit={() => setEditing(r.id)} />)}
        </div>
      )}
      {data.routines.length > 0 && templates.length > 0 && (
        <Panel title="Weitere Vorlagen">
          <Templates templates={templates} onPick={pick} />
        </Panel>
      )}
      {editing === 'neu' && <RoutineSheet onClose={() => setEditing(null)} />}
      {edited && <RoutineSheet key={edited.id} routine={edited} onClose={() => setEditing(null)} />}
    </>
  );
}
