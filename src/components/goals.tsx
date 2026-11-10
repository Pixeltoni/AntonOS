import { useState } from 'react';
import { newId, useStore } from '../store';
import type { Goal, KeyResult, KeyResultKind } from '../types';
import { today } from '../lib/dates';
import { defaultTarget, measureResult, RESULT_KINDS, weekContributions } from '../lib/goals';
import { TARGET_STEPS, formatGrade } from '../lib/grades';
import { Sheet } from './sheet';

const parse = (v: string) => {
  const n = Number(v.replace(',', '.'));
  return Number.isFinite(n) ? n : undefined;
};

/** Schlüsselergebnis anlegen oder bearbeiten */
function ResultSheet({ goal, result, onClose }: { goal: Goal; result?: KeyResult; onClose: () => void }) {
  const { data, update } = useStore();
  const [kind, setKind] = useState<KeyResultKind>(result?.kind ?? 'spartopf');
  const [refId, setRefId] = useState<string>(result?.refId ?? '');
  const [target, setTarget] = useState(result?.target !== undefined ? String(result.target).replace('.', ',') : '');
  const [current, setCurrent] = useState(result?.current !== undefined ? String(result.current).replace('.', ',') : '0');
  const [unit, setUnit] = useState(result?.unit ?? '');
  const [label, setLabel] = useState(result?.label ?? '');

  const options: { id: string; name: string }[] =
    kind === 'spartopf' ? data.pots.map((p) => ({ id: p.id, name: `${p.icon} ${p.name}` }))
    : kind === 'karten' ? [{ id: '', name: 'Alle Lernkarten' }, ...data.courses.map((c) => ({ id: c.id, name: c.name }))]
    : kind === 'note' ? data.courses.map((c) => ({ id: c.id, name: c.name }))
    : kind === 'projekt' ? data.projects.map((p) => ({ id: p.id, name: p.title }))
    : kind === 'gewohnheit' ? data.habits.map((h) => ({ id: h.id, name: `${h.icon} ${h.name}` }))
    : [];
  const needsRef = ['spartopf', 'note', 'projekt', 'gewohnheit'].includes(kind);
  const ref = options.some((o) => o.id === refId) ? refId : options[0]?.id ?? '';
  const missingRef = needsRef && !ref;
  const emptyText: Record<string, string> = { spartopf: 'Leg zuerst unter Finanzen einen Spartopf an.', note: 'Leg zuerst einen Kurs an.', projekt: 'Leg zuerst ein Projekt an.', gewohnheit: 'Leg zuerst eine Gewohnheit an.' };

  const pick = (k: KeyResultKind) => {
    setKind(k);
    setRefId('');
    const t = defaultTarget(k);
    setTarget(t === undefined ? '' : String(t).replace('.', ','));
  };

  const save = () => {
    const item: KeyResult = { id: result?.id ?? newId(), kind, refId: kind === 'karten' ? ref || null : needsRef ? ref : undefined, label: label.trim() || undefined };
    const t = parse(target);
    if (t !== undefined && t > 0) item.target = t;
    if (kind === 'manuell') {
      item.current = parse(current) ?? 0;
      item.unit = unit.trim() || undefined;
    }
    const list = goal.results ?? [];
    update('goals', goal.id, { results: result ? list.map((r) => (r.id === result.id ? item : r)) : [...list, item] });
    onClose();
  };

  return (
    <Sheet title={result ? 'Messgröße bearbeiten' : 'Ziel messbar machen'} submitLabel={result ? 'Sichern' : 'Hinzufügen'} submitDisabled={missingRef} onClose={onClose} onSubmit={save}>
      <p className="muted small">AntonOS liest den Stand aus deinen Daten, der Fortschritt von „{goal.title}“ rechnet sich dann selbst.</p>
      <div className="kr-kinds" role="radiogroup" aria-label="Woran misst sich das Ziel?">
        {RESULT_KINDS.map((k) => (
          <button key={k.kind} type="button" role="radio" aria-checked={kind === k.kind} className={kind === k.kind ? 'on' : ''} onClick={() => pick(k.kind)}>
            <span aria-hidden>{k.icon}</span>
            <strong>{k.label}</strong>
            <small>{k.hint}</small>
          </button>
        ))}
      </div>
      {options.length > 0 && (
        <label>
          {kind === 'spartopf' ? 'Spartopf' : kind === 'projekt' ? 'Projekt' : kind === 'gewohnheit' ? 'Gewohnheit' : 'Kurs'}
          <select value={ref} onChange={(e) => setRefId(e.target.value)}>
            {options.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
          </select>
        </label>
      )}
      {missingRef && <p className="danger small">{emptyText[kind]}</p>}
      {(kind === 'note' || kind === 'schnitt') && (
        <label>
          Wunschnote
          <select value={target || '2'} onChange={(e) => setTarget(e.target.value)}>
            {TARGET_STEPS.map((s) => <option key={s} value={String(s).replace('.', ',')}>{formatGrade(s, 1)}</option>)}
          </select>
        </label>
      )}
      {(kind === 'training' || kind === 'gewohnheit') && (
        <label>{kind === 'training' ? 'Trainings pro Woche' : 'Tage pro Woche'}<input inputMode="numeric" value={target} onChange={(e) => setTarget(e.target.value)} /></label>
      )}
      {kind === 'manuell' && (
        <div className="modal-grid">
          <label>Stand<input inputMode="decimal" value={current} onChange={(e) => setCurrent(e.target.value)} /></label>
          <label>Ziel<input inputMode="decimal" value={target} onChange={(e) => setTarget(e.target.value)} /></label>
          <label>Einheit<input value={unit} placeholder="z. B. Bücher" onChange={(e) => setUnit(e.target.value)} /></label>
        </div>
      )}
      <label>Name (optional)<input value={label} placeholder="z. B. Portugiesisch A2" onChange={(e) => setLabel(e.target.value)} /></label>
      {result && (
        <button type="button" className="danger" onClick={() => {
          update('goals', goal.id, { results: (goal.results ?? []).filter((r) => r.id !== result.id) });
          onClose();
        }}>Messgröße entfernen</button>
      )}
    </Sheet>
  );
}

/** Schlüsselergebnisse eines Ziels mit Stand, Beitrag dieser Woche und Bearbeiten */
export function GoalResults({ goal }: { goal: Goal }) {
  const { data, update } = useStore();
  const [sheet, setSheet] = useState<{ result?: KeyResult } | null>(null);
  const t = today();
  const results = goal.results ?? [];
  const step = (r: KeyResult, by: number) =>
    update('goals', goal.id, { results: results.map((x) => (x.id === r.id ? { ...x, current: Math.max(0, Math.round(((x.current ?? 0) + by) * 100) / 100) } : x)) });

  return (
    <div className="kr">
      {results.map((r) => {
        const m = measureResult(r, data, t);
        return (
          <div key={r.id} className={`kr-row ${m.missing ? 'missing' : ''}`}>
            <button type="button" className="kr-main" onClick={() => setSheet({ result: r })} aria-label={`${m.label} bearbeiten`}>
              <span className="kr-top">
                <span className="kr-label">{m.label}</span>
                <span className="kr-pct">{Math.round(m.share * 100)} %</span>
              </span>
              <span className="kr-bar" aria-hidden><i style={{ width: `${m.share * 100}%` }} /></span>
              <span className="kr-text muted small">{m.text}</span>
            </button>
            {m.week && <span className="kr-week">Diese Woche: {m.week}</span>}
            {r.kind === 'manuell' && (
              <span className="kr-steps">
                <button type="button" className="icon" aria-label="Eins weniger" onClick={() => step(r, -1)}>−</button>
                <button type="button" className="icon" aria-label="Eins mehr" onClick={() => step(r, 1)}>+</button>
              </span>
            )}
          </div>
        );
      })}
      <button type="button" className="link kr-add" onClick={() => setSheet({})}>{results.length ? '+ Weitere Messgröße' : 'Messbar machen'}</button>
      {sheet && <ResultSheet goal={goal} result={sheet.result} onClose={() => setSheet(null)} />}
    </div>
  );
}

/** Heute: was diese Woche auf deine Ziele eingezahlt hat */
export function GoalsThisWeek() {
  const { data } = useStore();
  const list = weekContributions(data.goals, data, today());
  if (!list.length) return null;
  return (
    <ul className="ios-group today-list goals-week">
      {list.slice(0, 4).map((c) => (
        <li key={c.goalId}>
          <a href="#/ziele">
            <span className="today-ico" aria-hidden>🎯</span>
            <span className="grow goals-week-text">
              <strong>{c.title}</strong>
              <small className="muted">{c.items.join(' · ')}</small>
            </span>
          </a>
        </li>
      ))}
    </ul>
  );
}
