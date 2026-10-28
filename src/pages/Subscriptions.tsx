import { useState } from 'react';
import { useStore } from '../store';
import type { Recurring } from '../types';
import { formatDate, relativeLabel, today } from '../lib/dates';
import { formatMoney, monthKey } from '../lib/life';
import { categoryStyle, nextBooking } from '../lib/finance';
import { contractStatus, detectSubscriptions, everyLabel, INTERVALS, isRunning, perMonth, subscriptionTotals, type ContractStatus } from '../lib/subscriptions';
import { Empty, PageHeader, Panel } from '../components/ui';
import { AddButton, Sheet } from '../components/sheet';
import { useToast } from '../components/toast';

const CATEGORIES = ['Abos', 'Miete', 'Mobilität', 'Freizeit', 'Studium', 'Gesundheit', 'Sport', 'Versicherung', 'Handy & Internet', 'Sonstiges'];
const NOTICE_OPTIONS = [
  { days: 0, label: 'keine' },
  { days: 14, label: '2 Wochen' },
  { days: 30, label: '1 Monat' },
  { days: 60, label: '2 Monate' },
  { days: 90, label: '3 Monate' },
];
const RENEW_OPTIONS = [
  { months: 0, label: 'endet von selbst' },
  { months: 1, label: 'um 1 Monat' },
  { months: 12, label: 'um 12 Monate' },
  { months: 24, label: 'um 24 Monate' },
];
const DISMISSED_KEY = 'antonos:abo-vorschlaege-aus';

const parseAmount = (raw: string) => {
  const v = Number(raw.trim().replace(/\s|€/g, '').replace(/\.(?=\d{3}\b)/g, '').replace(',', '.'));
  return Number.isFinite(v) ? Math.round(v * 100) / 100 : 0;
};

/** Farbiges Kästchen mit Anfangsbuchstaben in Kategoriefarbe */
function AboIcon({ r }: { r: Recurring }) {
  const c = categoryStyle(r.category).color;
  return <span className="abo-icon" style={{ background: c }} aria-hidden>{(r.description || r.category).trim().charAt(0).toUpperCase()}</span>;
}

function statusText(s: ContractStatus): string {
  switch (s.state) {
    case 'gekuendigt':
      return `gekündigt zum ${formatDate(s.deadline!)}`;
    case 'beendet':
      return `beendet am ${formatDate(s.deadline!)}`;
    case 'pausiert':
      return 'pausiert';
    case 'frist':
      return s.daysLeft === 0 ? 'heute letzter Tag zum Kündigen' : `Kündigen bis ${formatDate(s.deadline!)}`;
    case 'laufzeit':
      return `Laufzeit bis ${formatDate(s.termEnd!)} · kündbar bis ${formatDate(s.deadline!)}`;
    case 'flexibel':
      return 'jederzeit kündbar';
  }
}

type Draft = Omit<Recurring, 'id'>;
const blank = (): Draft => ({ type: 'Ausgabe', description: '', amount: 0, category: 'Abos', account: 'Girokonto', day: Number(today().slice(8)), start: monthKey(today()), lastBooked: null, every: 1, termEnd: null, noticeDays: 0, renewMonths: 0, endsOn: null });

/** Abo anlegen oder bearbeiten */
function AboSheet({ initial, id, onClose }: { initial: Draft; id?: string; onClose: () => void }) {
  const { add, update, remove } = useStore();
  const [d, setD] = useState(initial);
  const [amount, setAmount] = useState(initial.amount ? String(initial.amount).replace('.', ',') : '');
  const [contract, setContract] = useState(!!initial.termEnd);
  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setD((x) => ({ ...x, [k]: v }));
  const value = parseAmount(amount);
  return (
    <Sheet
      title={id ? 'Abo bearbeiten' : 'Neues Abo'}
      submitLabel={id ? 'Sichern' : 'Hinzufügen'}
      submitDisabled={!d.description.trim() || !(value > 0)}
      onClose={onClose}
      onSubmit={() => {
        const next = { ...d, description: d.description.trim(), amount: value, termEnd: contract ? d.termEnd || null : null, noticeDays: contract ? d.noticeDays : 0, renewMonths: contract ? d.renewMonths : 0 };
        if (id) update('recurring', id, next);
        else add('recurring', next);
        onClose();
      }}
    >
      <div className="form-grid">
        <label className="full">Name<input value={d.description} onChange={(e) => set('description', e.target.value)} placeholder="z. B. Netflix, Fitnessstudio, Handyvertrag" autoFocus={!id} /></label>
        <label>Betrag in €<input inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="9,99" /></label>
        <label>Abstand
          <select value={d.every ?? 1} onChange={(e) => set('every', Number(e.target.value))}>
            {INTERVALS.map((i) => <option key={i.months} value={i.months}>{i.label}</option>)}
          </select>
        </label>
        <label>Am Tag<input type="number" min={1} max={31} value={d.day} onChange={(e) => set('day', Math.min(31, Math.max(1, Number(e.target.value) || 1)))} /></label>
        <label>{(d.every ?? 1) > 1 ? 'Nächste Abbuchung im Monat' : 'Ab Monat'}<input type="month" value={d.start} onChange={(e) => e.target.value && set('start', e.target.value)} /></label>
        <label>Kategorie<input list="abo-categories" value={d.category} onChange={(e) => set('category', e.target.value)} /></label>
        <datalist id="abo-categories">{CATEGORIES.map((c) => <option key={c} value={c} />)}</datalist>
        <label>Konto<input value={d.account} onChange={(e) => set('account', e.target.value)} /></label>
        <label className="check full"><input type="checkbox" checked={contract} onChange={(e) => setContract(e.target.checked)} /> Vertrag mit fester Laufzeit</label>
        {contract && (
          <>
            <label>Laufzeit endet am<input type="date" value={d.termEnd ?? ''} onChange={(e) => set('termEnd', e.target.value || null)} /></label>
            <label>Kündigungsfrist
              <select value={d.noticeDays ?? 0} onChange={(e) => set('noticeDays', Number(e.target.value))}>
                {NOTICE_OPTIONS.map((o) => <option key={o.days} value={o.days}>{o.label}</option>)}
              </select>
            </label>
            <label>Ohne Kündigung verlängert sich der Vertrag
              <select value={d.renewMonths ?? 0} onChange={(e) => set('renewMonths', Number(e.target.value))}>
                {RENEW_OPTIONS.map((o) => <option key={o.months} value={o.months}>{o.label}</option>)}
              </select>
            </label>
          </>
        )}
        {id && <label>Gekündigt zum<input type="date" value={d.endsOn ?? ''} onChange={(e) => set('endsOn', e.target.value || null)} /></label>}
        {id && <label className="check"><input type="checkbox" checked={!!d.paused} onChange={(e) => set('paused', e.target.checked)} /> Pausiert</label>}
      </div>
      <p className="muted small">AntonOS bucht die Zahlung automatisch in den Finanzen und erinnert dich zwei Wochen vor einer Kündigungsfrist.</p>
      {id && (
        <button type="button" className="danger" onClick={() => { if (confirm(`„${d.description}“ löschen? Schon gebuchte Einträge bleiben.`)) { remove('recurring', id); onClose(); } }}>Abo löschen</button>
      )}
    </Sheet>
  );
}

function AboRow({ r, onOpen }: { r: Recurring; onOpen: () => void }) {
  const t = today();
  const s = contractStatus(r, t);
  const next = nextBooking(r, t);
  const ended = s.state === 'beendet' || s.state === 'pausiert';
  return (
    <li className={`abo-row ${ended ? 'paused' : ''}`}>
      <button type="button" className="abo-open grow" onClick={onOpen}>
        <AboIcon r={r} />
        <span className="grow abo-text">
          <span className="task-title">{r.description || r.category}</span>
          <span className={`meta ${s.state === 'frist' ? 'abo-warn' : ''}`}>
            {!ended && next && <span>{relativeLabel(next, t)}</span>}
            <span>{everyLabel(r)}</span>
            <span>{statusText(s)}</span>
          </span>
        </span>
        <span className="abo-amount">
          <strong className={s.state === 'beendet' ? 'struck' : ''}>{formatMoney(r.amount)}</strong>
          {(r.every ?? 1) > 1 && <span className="muted small">{formatMoney(perMonth(r))} / Monat</span>}
        </span>
      </button>
    </li>
  );
}

export function Subscriptions() {
  const { data, add, update, mutate } = useStore();
  const { show } = useToast();
  const t = today();
  const [yearly, setYearly] = useState(false);
  const [sheet, setSheet] = useState<{ initial: Draft; id?: string } | null>(null);
  const [dismissed, setDismissed] = useState<string[]>(() => {
    try {
      return JSON.parse(localStorage.getItem(DISMISSED_KEY) ?? '[]');
    } catch {
      return [];
    }
  });
  const expenses = data.recurring.filter((r) => r.type === 'Ausgabe');
  const running = expenses
    .filter((r) => isRunning(r, t))
    .map((r) => ({ r, next: nextBooking(r, t) ?? '9999' }))
    .sort((a, b) => a.next.localeCompare(b.next))
    .map((x) => x.r);
  const stopped = expenses.filter((r) => !isRunning(r, t));
  const totals = subscriptionTotals(data.recurring, t);
  const deadlines = running.map((r) => ({ r, s: contractStatus(r, t) })).filter((x) => x.s.state === 'frist');
  const hints = detectSubscriptions(data.transactions, data.recurring, t).filter((h) => !dismissed.includes(h.description.toLowerCase()));
  const sum = yearly ? totals.year : totals.month;

  const dismiss = (name: string) => {
    const next = [...dismissed, name.toLowerCase()];
    setDismissed(next);
    try {
      localStorage.setItem(DISMISSED_KEY, JSON.stringify(next.slice(-100)));
    } catch {
      // egal
    }
  };

  return (
    <>
      <PageHeader
        title="Abos & Verträge"
        subtitle={running.length ? `${running.length} laufend · ${formatMoney(totals.month)} im Monat` : 'Noch nichts erfasst'}
        actions={<AddButton label="Neues Abo" onClick={() => setSheet({ initial: blank() })} />}
      />
      <div className="abo-top">
        <div className="abo-summary">
          <div className="row between">
            <span className="abo-summary-label">Laufende Kosten</span>
            <div className="segmented dark" role="radiogroup" aria-label="Zeitraum">
              <button type="button" role="radio" aria-checked={!yearly} className={!yearly ? 'selected' : ''} onClick={() => setYearly(false)}>Monat</button>
              <button type="button" role="radio" aria-checked={yearly} className={yearly ? 'selected' : ''} onClick={() => setYearly(true)}>Jahr</button>
            </div>
          </div>
          <div className="abo-sum"><strong>{formatMoney(sum)}</strong><span>pro {yearly ? 'Jahr' : 'Monat'}</span></div>
          {totals.byCategory.length > 0 && (
            <>
              <div className="abo-bar" aria-hidden>
                {totals.byCategory.map((c) => <span key={c.category} style={{ flex: c.amount, background: categoryStyle(c.category).color }} />)}
              </div>
              <ul className="abo-legend">
                {totals.byCategory.map((c) => (
                  <li key={c.category}><span className="ring-dot" style={{ background: categoryStyle(c.category).color }} />{c.category}<span className="grow" />{formatMoney(yearly ? c.amount * 12 : c.amount)}</li>
                ))}
              </ul>
            </>
          )}
        </div>
        <div className="stack">
          {deadlines.map(({ r, s }) => (
            <div key={r.id} className="abo-deadline" role="status">
              <strong>{r.description}: {s.daysLeft === 0 ? 'heute letzter Tag zum Kündigen' : `noch ${s.daysLeft} ${s.daysLeft === 1 ? 'Tag' : 'Tage'} kündbar`}</strong>
              <span>{(r.renewMonths ?? 0) > 0 ? `Verlängert sich sonst am ${formatDate(s.termEnd!)} um ${r.renewMonths} ${r.renewMonths === 1 ? 'Monat' : 'Monate'}.` : `Läuft am ${formatDate(s.termEnd!)} aus.`}</span>
              <div className="row wrap">
                <button
                  type="button"
                  className="primary"
                  onClick={() => {
                    add('tasks', { title: `${r.description} kündigen`, courseId: null, kind: 'Aufgabe', status: 'offen', priority: 'hoch', due: s.deadline, note: `Kündigungsfrist: ${formatDate(s.deadline!)}` });
                    show('Aufgabe angelegt', { label: 'Ansehen', run: () => (location.hash = '#/aufgaben') });
                  }}
                >
                  Als Aufgabe
                </button>
                <button type="button" onClick={() => update('recurring', r.id, { endsOn: s.termEnd })}>Ist gekündigt</button>
              </div>
            </div>
          ))}
          {hints.slice(0, 3).map((h) => (
            <div key={h.description} className="abo-hint">
              <span>Neu erkannt: „{h.description}“ über {formatMoney(h.amount)} kam in {h.months} Monaten – als Abo speichern?</span>
              <div className="row">
                <button
                  type="button"
                  onClick={() => {
                    const last = data.transactions.filter((x) => x.description === h.description && x.amount === h.amount).map((x) => monthKey(x.date)).sort().pop() ?? monthKey(t);
                    mutate((d) => ({ ...d, recurring: [...d.recurring, { id: crypto.randomUUID(), type: 'Ausgabe', description: h.description, amount: h.amount, category: h.category === 'Sonstiges' ? 'Abos' : h.category, account: h.account, day: h.day, start: last, lastBooked: last, every: 1 }] }));
                    show(`„${h.description}“ als Abo gespeichert`);
                  }}
                >
                  Speichern
                </button>
                <button type="button" className="link-button" onClick={() => dismiss(h.description)}>Kein Abo</button>
              </div>
            </div>
          ))}
        </div>
      </div>
      <Panel title="Nächste Abbuchungen">
        {running.length === 0 ? <Empty>Noch keine Abos. Tipp mit „+“ eins an – z. B. Netflix, Handyvertrag oder Fitnessstudio.</Empty> : (
          <ul className="list abo-list">{running.map((r) => <AboRow key={r.id} r={r} onOpen={() => setSheet({ initial: r, id: r.id })} />)}</ul>
        )}
      </Panel>
      {stopped.length > 0 && (
        <details className="panel abo-stopped">
          <summary>{stopped.length} beendet oder pausiert</summary>
          <ul className="list abo-list">{stopped.map((r) => <AboRow key={r.id} r={r} onOpen={() => setSheet({ initial: r, id: r.id })} />)}</ul>
        </details>
      )}
      <p className="muted small">Abos sind Daueraufträge aus den <a href="#/finanzen">Finanzen</a> – sie werden dort automatisch gebucht. Einnahmen wie Gehalt stehen nur in den Finanzen.</p>
      {sheet && <AboSheet initial={sheet.initial} id={sheet.id} onClose={() => setSheet(null)} />}
    </>
  );
}
