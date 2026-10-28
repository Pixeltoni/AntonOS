import { useEffect, useState } from 'react';
import { useStore } from '../store';
import type { Recurring, SavingsPot, Transaction, TxType, WidgetVariant } from '../types';
import { formatDate, relativeLabel, today } from '../lib/dates';
import { formatMoney, monthKey, monthLabel, shiftMonth } from '../lib/life';
import { applyRecurring, budgetStatus, categoryStyle, donutSegments, nextBooking, toCsv, type BudgetStatus } from '../lib/finance';
import { defaultFinance } from '../demo';
import { Empty, PageHeader, Panel } from '../components/ui';

const CATEGORIES = ['Lebensmittel', 'Miete', 'Mobilität', 'Freizeit', 'Studium', 'Abos', 'Kleidung', 'Gesundheit', 'Sparen', 'Gehalt', 'BAföG', 'Sonstiges'];
const ACCOUNTS = ['Girokonto', 'Bar', 'Kreditkarte', 'Sparkonto'];
const POT_COLORS = ['#007AFF', '#34C759', '#FF9500', '#AF52DE', '#FF2D55', '#30B0C7'];

/** „12,50“, „12.50“ und „1.200,00“ verstehen */
const parseAmount = (raw: string) => {
  const s = raw.trim().replace(/\s|€/g, '');
  const thousands = s.includes(',') || /^-?\d{1,3}(\.\d{3})+$/.test(s);
  const v = Number(thousands ? s.replace(/\./g, '').replace(',', '.') : s);
  return Number.isFinite(v) ? Math.round(v * 100) / 100 : 0;
};
const euro = (v: number) => (Number.isInteger(v) ? v.toLocaleString('de-DE', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }) : formatMoney(v));

/** Trägt fällige Daueraufträge ein – beim Start und einmal pro Stunde. */
export function useRecurringBookings() {
  const { mutate, data } = useStore();
  const count = data.recurring.length;
  useEffect(() => {
    const run = () => mutate((d) => applyRecurring(d, today()));
    run();
    const id = setInterval(run, 60 * 60_000);
    return () => clearInterval(id);
  }, [mutate, count]);
}

function CategoryIcon({ category }: { category: string }) {
  const s = categoryStyle(category);
  return <span className="cat-icon" style={{ background: s.color }} aria-hidden>{s.icon}</span>;
}

export function TransactionList({ txs }: { txs: Transaction[] }) {
  const { remove } = useStore();
  const t = today();
  if (txs.length === 0) return <Empty>Keine Buchungen.</Empty>;
  return (
    <ul className="list tx-list">
      {txs.map((x) => (
        <li key={x.id}>
          <CategoryIcon category={x.category} />
          <div className="grow">
            <div className="task-title">{x.description || x.category}</div>
            <div className="meta">
              <span>{x.category}</span>
              <span title={formatDate(x.date)}>{relativeLabel(x.date, t)}</span>
              {x.id.startsWith('rec-') && <span title="Dauerauftrag">🔁</span>}
            </div>
          </div>
          <strong className={`tx-amount ${x.type === 'Einnahme' ? 'positive' : ''}`}>
            {x.type === 'Einnahme' ? '+' : '−'}{formatMoney(x.amount)}
          </strong>
          <button className="icon tx-delete" onClick={() => confirm(`„${x.description || x.category}“ löschen?`) && remove('transactions', x.id)} aria-label="Löschen" title="Löschen">×</button>
        </li>
      ))}
    </ul>
  );
}

export function sortTx(txs: Transaction[]): Transaction[] {
  return [...txs].sort((a, b) => b.date.localeCompare(a.date));
}

/** Karte wie in Apple Wallet: Budget und „Verfügbar“ */
export function WalletCard({ status, month, compact }: { status: BudgetStatus; month: string; compact?: boolean }) {
  const monthName = new Date(`${month}-01T12:00`).toLocaleDateString('de-DE', { month: 'long' });
  const share = status.budget > 0 ? Math.min(1, status.spent / status.budget) : 0;
  return (
    <div className={`wallet-card ${compact ? 'compact' : ''}`}>
      <div className="wallet-top">
        <span>{status.budget > 0 ? `Budget ${monthName}` : `Saldo ${monthName}`}</span>
        {status.budget > 0 && <strong>{euro(status.budget)}</strong>}
      </div>
      <div className="wallet-bottom">
        <span className="wallet-label">{status.budget > 0 ? 'Verfügbar' : 'Einnahmen − Ausgaben'}</span>
        <span className={`wallet-value ${status.available < 0 ? 'negative' : ''}`}>{formatMoney(status.available)}</span>
        {status.budget > 0 && (
          <span className="wallet-bar" aria-hidden>
            <span style={{ width: `${share * 100}%`, background: share >= 0.9 ? '#FF9500' : '#34C759' }} />
          </span>
        )}
      </div>
    </div>
  );
}

/** Ausgaben nach Kategorie als farbiger Ring */
export function Donut({ status, size = 150 }: { status: BudgetStatus; size?: number }) {
  const segs = donutSegments(status.categories.map((c) => ({ ...c, amount: c.spent })));
  const sw = Math.round(size / 7.5);
  const r = size / 2 - sw / 2;
  const c = 2 * Math.PI * r;
  const gap = segs.length > 1 ? Math.min(3, c * 0.01) : 0;
  return (
    <div className="donut" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--ring-track)" strokeWidth={sw} />
        {segs.map((s) => (
          <circle
            key={s.category}
            cx={size / 2}
            cy={size / 2}
            r={r}
            fill="none"
            stroke={categoryStyle(s.category).color}
            strokeWidth={sw}
            strokeDasharray={`${Math.max(0, (s.to - s.from) * c - gap)} ${c}`}
            strokeDashoffset={-s.from * c}
            transform={`rotate(-90 ${size / 2} ${size / 2})`}
          />
        ))}
      </svg>
      <div className="donut-center">
        <span className="muted small">Ausgaben</span>
        <strong>{euro(Math.round(status.spent))}</strong>
      </div>
    </div>
  );
}

function CategoryLegend({ status }: { status: BudgetStatus }) {
  const shown = status.categories.filter((c) => c.spent > 0 || c.budget > 0);
  if (shown.length === 0) return <Empty>Keine Ausgaben in diesem Monat.</Empty>;
  return (
    <ul className="cat-legend">
      {shown.map((c) => (
        <li key={c.category} className={c.warn ? 'warn' : ''}>
          <span className="ring-dot" style={{ background: categoryStyle(c.category).color }} />
          <span className="grow">{c.category}</span>
          <span>
            {euro(Math.round(c.spent * 100) / 100)}
            {c.budget > 0 && <span className="muted"> / {euro(c.budget)}</span>}
          </span>
          {c.budget > 0 && (
            <span className="cat-bar" aria-hidden>
              <span style={{ width: `${Math.min(1, c.share) * 100}%`, background: c.warn ? '#FF9500' : categoryStyle(c.category).color }} />
            </span>
          )}
        </li>
      ))}
    </ul>
  );
}

function Warnings({ status }: { status: BudgetStatus }) {
  const warn = status.categories.filter((c) => c.warn);
  const total = status.budget > 0 && status.spent / status.budget >= 0.9;
  if (!warn.length && !total) return null;
  const rest = status.daysLeft > 0 ? ` – noch ${status.daysLeft} ${status.daysLeft === 1 ? 'Tag' : 'Tage'} im Monat.` : '.';
  return (
    <div className="budget-warnings" role="status">
      {total && <p>⚠️ Gesamtbudget bei {Math.round((status.spent / status.budget) * 100)} %{rest}</p>}
      {warn.map((c) => (
        <p key={c.category}>⚠️ {c.category} bei {Math.round(c.share * 100)} % deines Budgets{rest}</p>
      ))}
    </div>
  );
}

function TxForm() {
  const { add } = useStore();
  const t = today();
  const [type, setType] = useState<TxType>('Ausgabe');
  const [description, setDescription] = useState('');
  const [amount, setAmount] = useState('');
  const [category, setCategory] = useState('Lebensmittel');
  const [account, setAccount] = useState('Girokonto');
  const [date, setDate] = useState(t);
  const [repeat, setRepeat] = useState(false);
  return (
    <form
      className="inline-form"
      onSubmit={(e) => {
        e.preventDefault();
        const value = parseAmount(amount);
        if (!(value > 0)) return;
        const base = { type, description: description.trim(), amount: value, category: category.trim() || 'Sonstiges', account: account.trim() || 'Girokonto' };
        // Daueraufträge bucht AntonOS selbst – auch diesen Monat, sobald der Tag erreicht ist
        if (repeat) add('recurring', { ...base, day: Number(date.slice(8)), start: date.slice(0, 7), lastBooked: null });
        else add('transactions', { ...base, date });
        setDescription('');
        setAmount('');
        setRepeat(false);
      }}
    >
      <select value={type} onChange={(e) => setType(e.target.value as TxType)} aria-label="Art">
        <option>Ausgabe</option>
        <option>Einnahme</option>
      </select>
      <input className="grow" placeholder="Beschreibung" value={description} onChange={(e) => setDescription(e.target.value)} aria-label="Beschreibung" />
      <input className="narrow" placeholder="€" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} aria-label="Betrag in Euro" required />
      <input list="tx-categories" value={category} onChange={(e) => setCategory(e.target.value)} aria-label="Kategorie" />
      <datalist id="tx-categories">{CATEGORIES.map((c) => <option key={c} value={c} />)}</datalist>
      <input list="tx-accounts" value={account} onChange={(e) => setAccount(e.target.value)} aria-label="Konto" />
      <datalist id="tx-accounts">{ACCOUNTS.map((c) => <option key={c} value={c} />)}</datalist>
      <input type="date" value={date} onChange={(e) => setDate(e.target.value)} aria-label="Datum" required />
      <label className="check">
        <input type="checkbox" checked={repeat} onChange={(e) => setRepeat(e.target.checked)} /> Monatlich
      </label>
      <button className="primary" type="submit">Hinzufügen</button>
    </form>
  );
}

function RecurringList() {
  const { data, update, remove } = useStore();
  const t = today();
  const list = [...data.recurring].sort((a, b) => a.day - b.day);
  const monthly = list.filter((r) => !r.paused).reduce((s, r) => s + (r.type === 'Ausgabe' ? -r.amount : r.amount), 0);
  if (list.length === 0) return <Empty>Noch keine Daueraufträge. Setz beim Erfassen den Haken „Monatlich“.</Empty>;
  return (
    <>
      <ul className="list tx-list">
        {list.map((r: Recurring) => (
          <li key={r.id} className={r.paused ? 'paused' : ''}>
            <CategoryIcon category={r.category} />
            <div className="grow">
              <div className="task-title">{r.description || r.category}</div>
              <div className="meta">
                <span>am {r.day}. jedes Monats</span>
                <span>{r.paused ? 'pausiert' : `nächste: ${formatDate(nextBooking(r, t))}`}</span>
              </div>
            </div>
            <strong className={`tx-amount ${r.type === 'Einnahme' ? 'positive' : ''}`}>{r.type === 'Einnahme' ? '+' : '−'}{formatMoney(r.amount)}</strong>
            <button className="icon" onClick={() => update('recurring', r.id, { paused: !r.paused })} title={r.paused ? 'Fortsetzen' : 'Pausieren'} aria-label={r.paused ? 'Fortsetzen' : 'Pausieren'}>
              {r.paused ? '▶' : '❚❚'}
            </button>
            <button className="icon" onClick={() => confirm(`Dauerauftrag „${r.description || r.category}“ löschen? Schon gebuchte Einträge bleiben.`) && remove('recurring', r.id)} aria-label="Löschen" title="Löschen">×</button>
          </li>
        ))}
      </ul>
      <p className="muted small">Pro Monat: <strong>{monthly >= 0 ? '+' : '−'}{formatMoney(Math.abs(monthly))}</strong></p>
    </>
  );
}

type PotMode = 'konto' | 'einnahme' | 'ohne' | 'raus';
const POT_MODES: { id: PotMode; label: string; hint: string }[] = [
  { id: 'konto', label: 'Vom Konto', hint: 'Wird als Ausgabe „Sparen“ gebucht und zählt zum Budget.' },
  { id: 'einnahme', label: 'Einnahme', hint: 'Geld von außen (z. B. Geschenk) – als Einnahme gebucht, belastet dein Budget nicht.' },
  { id: 'ohne', label: 'Ohne Buchung', hint: 'Ändert nur den Stand des Spartopfs.' },
  { id: 'raus', label: 'Entnehmen', hint: 'Geld zurück aufs Konto – wird als Einnahme gebucht.' },
];

function PotCard({ pot }: { pot: SavingsPot }) {
  const { update, remove, add } = useStore();
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [mode, setMode] = useState<PotMode>('konto');
  const share = pot.target > 0 ? Math.min(1, pot.saved / pot.target) : 0;
  return (
    <div className="pot" style={{ ['--pot' as string]: pot.color }}>
      <div className="row between">
        <strong>{pot.icon} {pot.name}</strong>
        <button className="icon" onClick={() => confirm(`Spartopf „${pot.name}“ löschen?`) && remove('pots', pot.id)} aria-label="Löschen" title="Löschen">×</button>
      </div>
      <div className="pot-amount">
        {formatMoney(pot.saved)} <span className="muted">/ {euro(pot.target)}</span>
      </div>
      <span className="pot-bar" aria-hidden><span style={{ width: `${share * 100}%` }} /></span>
      <form
        className="pot-form"
        onSubmit={(e) => {
          e.preventDefault();
          const v = parseAmount(amount);
          if (!v) return;
          const withdraw = mode === 'raus';
          const value = withdraw ? -Math.abs(v) : Math.abs(v);
          update('pots', pot.id, { saved: Math.max(0, Math.round((pot.saved + value) * 100) / 100) });
          const base = { amount: Math.abs(v), category: 'Sparen', account: 'Sparkonto', date: today() };
          // vom Konto = Ausgabe (zählt zum Budget), Einnahme = Geld kommt von außen (z. B. Geschenk), Entnehmen = zurück aufs Konto
          if (mode === 'konto') add('transactions', { ...base, type: 'Ausgabe', description: `Spartopf: ${pot.name}` });
          else if (mode === 'einnahme') add('transactions', { ...base, type: 'Einnahme', description: `${note.trim() || 'Einnahme'} → Spartopf ${pot.name}` });
          else if (mode === 'raus') add('transactions', { ...base, type: 'Einnahme', description: `Aus Spartopf: ${pot.name}` });
          setAmount('');
          setNote('');
        }}
      >
        <div className="segmented pot-modes" role="radiogroup" aria-label={`Art der Buchung für ${pot.name}`}>
          {POT_MODES.map((m) => (
            <button key={m.id} type="button" role="radio" aria-checked={mode === m.id} className={mode === m.id ? 'selected' : ''} title={m.hint} onClick={() => setMode(m.id)}>
              {m.label}
            </button>
          ))}
        </div>
        <div className="row">
          {mode === 'einnahme' && <input className="grow" placeholder="Woher? z. B. Geschenk" value={note} onChange={(e) => setNote(e.target.value)} aria-label="Woher kommt das Geld?" />}
          <input className="grow" inputMode="decimal" placeholder="Betrag €" value={amount} onChange={(e) => setAmount(e.target.value)} aria-label={`Betrag für ${pot.name}`} />
          <button type="submit">{mode === 'raus' ? 'Entnehmen' : 'Einzahlen'}</button>
        </div>
        <span className="muted small">{POT_MODES.find((m) => m.id === mode)!.hint}</span>
      </form>
      {share >= 1 && <p className="small">🎉 Ziel erreicht!</p>}
    </div>
  );
}

function Pots() {
  const { data, add } = useStore();
  const [name, setName] = useState('');
  const [target, setTarget] = useState('');
  return (
    <>
      {data.pots.length > 0 && <div className="pots">{data.pots.map((p) => <PotCard key={p.id} pot={p} />)}</div>}
      <form
        className="inline-form"
        onSubmit={(e) => {
          e.preventDefault();
          const goal = parseAmount(target);
          if (!name.trim() || !(goal > 0)) return;
          add('pots', { name: name.trim(), icon: '🐷', target: goal, saved: 0, color: POT_COLORS[data.pots.length % POT_COLORS.length] });
          setName('');
          setTarget('');
        }}
      >
        <input className="grow" placeholder="Neuer Spartopf, z. B. Auslandssemester" value={name} onChange={(e) => setName(e.target.value)} aria-label="Name des Spartopfs" />
        <input className="narrow" inputMode="decimal" placeholder="Ziel €" value={target} onChange={(e) => setTarget(e.target.value)} aria-label="Sparziel in Euro" />
        <button type="submit">Anlegen</button>
      </form>
    </>
  );
}

function BudgetSettings() {
  const { data, updateSettings } = useStore();
  const finance = data.settings.finance ?? defaultFinance();
  const [category, setCategory] = useState('Freizeit');
  const [amount, setAmount] = useState('');
  const set = (patch: Partial<typeof finance>) => updateSettings({ finance: { ...finance, ...patch } });
  return (
    <div className="col">
      <label className="row wrap">
        Monatsbudget für Ausgaben
        <input className="narrow" inputMode="decimal" value={finance.budget || ''} placeholder="0" onChange={(e) => set({ budget: Math.max(0, parseAmount(e.target.value)) })} aria-label="Monatsbudget in Euro" />
        €
      </label>
      {finance.categoryBudgets.length > 0 && (
        <ul className="list dense">
          {finance.categoryBudgets.map((b) => (
            <li key={b.category}>
              <span className="grow">{categoryStyle(b.category).icon} {b.category}</span>
              <span>{formatMoney(b.amount)}</span>
              <button className="icon" onClick={() => set({ categoryBudgets: finance.categoryBudgets.filter((x) => x.category !== b.category) })} aria-label={`Budget ${b.category} entfernen`}>×</button>
            </li>
          ))}
        </ul>
      )}
      <form
        className="inline-form"
        onSubmit={(e) => {
          e.preventDefault();
          const v = parseAmount(amount);
          const name = category.trim();
          if (!name || !(v > 0)) return;
          set({ categoryBudgets: [...finance.categoryBudgets.filter((x) => x.category !== name), { category: name, amount: v }] });
          setAmount('');
        }}
      >
        <input list="tx-categories" value={category} onChange={(e) => setCategory(e.target.value)} aria-label="Kategorie für Budget" />
        <input className="narrow" inputMode="decimal" placeholder="€" value={amount} onChange={(e) => setAmount(e.target.value)} aria-label="Budget der Kategorie" />
        <button type="submit">Budget setzen</button>
      </form>
      <p className="muted small">Ab 90 % eines Budgets warnt AntonOS dich.</p>
    </div>
  );
}

export function useBudgetStatus(month = monthKey(today())): BudgetStatus {
  const { data } = useStore();
  return budgetStatus(data.transactions, data.settings.finance ?? defaultFinance(), month, today());
}

/** Dashboard-Widget */
export function BudgetWidget({ variant = 'standard' }: { variant?: WidgetVariant }) {
  const month = monthKey(today());
  const status = useBudgetStatus(month);
  return (
    <div className="col">
      <WalletCard status={status} month={month} compact={variant === 'kompakt'} />
      {variant !== 'kompakt' && <Warnings status={status} />}
      {variant === 'detail' && (
        <div className="donut-row">
          <Donut status={status} size={120} />
          <CategoryLegend status={status} />
        </div>
      )}
    </div>
  );
}

export function Finance() {
  const { data } = useStore();
  const t = today();
  const [month, setMonth] = useState(monthKey(t));
  const status = useBudgetStatus(month);
  const txs = sortTx(data.transactions.filter((x) => monthKey(x.date) === month));

  const exportCsv = (all: boolean) => {
    const list = all ? data.transactions : txs;
    const blob = new Blob([toCsv(list)], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = all ? `antonos-buchungen-${t}.csv` : `antonos-buchungen-${month}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  return (
    <>
      <PageHeader
        title="Finanzen"
        subtitle={monthLabel(month)}
        actions={
          <>
            <button onClick={() => setMonth(shiftMonth(month, -1))} aria-label="Voriger Monat">‹</button>
            <button onClick={() => setMonth(monthKey(t))}>Aktueller Monat</button>
            <button onClick={() => setMonth(shiftMonth(month, 1))} aria-label="Nächster Monat">›</button>
          </>
        }
      />
      <div className="wallet-row">
        <WalletCard status={status} month={month} />
        <Panel>
          <div className="donut-row">
            <Donut status={status} />
            <CategoryLegend status={status} />
          </div>
        </Panel>
      </div>
      <Warnings status={status} />
      <Panel title="Buchung erfassen"><TxForm /></Panel>
      <div className="grid-2">
        <Panel
          title={`${txs.length} Buchungen`}
          actions={
            <div className="row">
              <button onClick={() => exportCsv(false)} disabled={txs.length === 0}>CSV (Monat)</button>
              <button onClick={() => exportCsv(true)} disabled={data.transactions.length === 0}>CSV (alle)</button>
            </div>
          }
        >
          <TransactionList txs={txs} />
        </Panel>
        <div className="stack">
          <Panel title="🐷 Spartöpfe"><Pots /></Panel>
          <Panel title="🔁 Daueraufträge"><RecurringList /></Panel>
          <Panel title="💳 Budget"><BudgetSettings /></Panel>
        </div>
      </div>
    </>
  );
}
