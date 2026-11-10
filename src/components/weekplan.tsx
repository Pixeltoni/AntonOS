import { useStore } from '../store';
import type { DateStr } from '../types';
import { addDays, daysBetween, today } from '../lib/dates';
import { formatMoney } from '../lib/life';
import { tap } from '../lib/haptics';
import { focusState, mondayOf, spentBetween, weekNumber, weekPrompt } from '../lib/weekplan';

/** Gibt es auf „Heute“ etwas zur Woche zu zeigen? */
export function hasWeekCard(plans: Parameters<typeof weekPrompt>[0], t: DateStr): boolean {
  const { current, plan } = weekPrompt(plans, t);
  return !!plan || !!current?.focus.length || !!current?.budget;
}

const euros = (n: number) => formatMoney(n).replace(/,00(?=\s*€)/, '');

/** Wochenbudget: Ausgaben gegen das bestätigte Budget, mit Markierung, wo man „im Plan“ wäre */
function BudgetMeter({ budget, spent, monday, t }: { budget: number; spent: number; monday: DateStr; t: DateStr }) {
  const left = budget - spent;
  const share = Math.min(1, spent / budget);
  const pace = Math.min(7, Math.max(1, daysBetween(monday, t) + 1)) / 7;
  const over = spent > budget;
  const ahead = !over && share > pace + 0.1;
  return (
    <a className={`wp-meter ${over ? 'over' : ahead ? 'ahead' : ''}`} href="#/finanzen">
      <span className="wp-meter-top">
        <strong>Wochenbudget</strong>
        <span>{over ? `${formatMoney(-left)} drüber` : `${formatMoney(left)} übrig`}</span>
      </span>
      <span className="wp-meter-bar" aria-hidden>
        <i style={{ width: `${share * 100}%` }} />
        <b style={{ left: `${pace * 100}%` }} />
      </span>
      <small className="muted">{formatMoney(spent)} von {euros(budget)}{ahead ? ' · etwas schneller als geplant' : ''}</small>
    </a>
  );
}

/** „Heute“: Wochenziele abhaken, das Wochenbudget im Blick – und am Wochenende der Anstoß zum Planen */
export function WeekCard() {
  const { data, update } = useStore();
  const t = today();
  const { current, plan } = weekPrompt(data.weekPlans, t);
  const toggle = (id: string) => {
    if (!current) return;
    tap();
    update('weekPlans', current.id, { focus: current.focus.map((f) => (f.id === id ? { ...f, done: !f.done } : f)) });
  };
  const spent = current?.budget ? spentBetween(data.transactions, current.week, addDays(current.week, 6)) : 0;
  return (
    <div className="wp-today">
      {plan && (
        <a className="wp-prompt" href="#/wochenplan">
          <span className="wp-prompt-icon" aria-hidden>🗓️</span>
          <span className="grow">
            <strong>{plan === mondayOf(t) ? 'Diese Woche planen' : 'Nächste Woche planen'}</strong>
            <small>KW {weekNumber(plan)} · fünf Schritte, etwa fünf Minuten</small>
          </span>
          <span className="wp-prompt-go" aria-hidden>›</span>
        </a>
      )}
      {current && current.focus.length > 0 && (
        <ul className="ios-group today-list wp-today-focus">
          {current.focus.map((f) => {
            const s = focusState(f, data, current.week);
            const measured = !f.done && s.done;
            return (
              <li key={f.id} className={s.done ? 'done' : ''}>
                <button
                  type="button"
                  className={`check-pill ${s.done ? 'on' : ''}`}
                  onClick={() => toggle(f.id)}
                  disabled={measured}
                  aria-pressed={s.done}
                  aria-label={`„${f.text}“ ${s.done ? 'wieder offen' : 'geschafft'}`}
                >
                  {s.done ? '✓' : ''}
                </button>
                <span className="grow goals-week-text">
                  <strong>{f.icon ? `${f.icon} ` : ''}{f.text}</strong>
                  {s.text && <small className="muted">{s.text}{measured ? ' · geschafft' : ''}</small>}
                </span>
                {f.measure && !s.done && <span className="wp-mini-bar" aria-hidden><i style={{ width: `${s.share * 100}%` }} /></span>}
              </li>
            );
          })}
        </ul>
      )}
      {current?.budget ? <BudgetMeter budget={current.budget} spent={spent} monday={current.week} t={t} /> : null}
    </div>
  );
}
