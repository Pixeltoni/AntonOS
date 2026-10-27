import { useState } from 'react';
import { useStore } from '../store';
import type { Transaction, TxType } from '../types';
import { formatDate, today } from '../lib/dates';
import { formatMoney, monthKey, monthLabel, monthTotals, shiftMonth } from '../lib/life';
import { Empty, PageHeader, Panel, Progress, Stat } from '../components/ui';

const CATEGORIES = ['Lebensmittel', 'Miete', 'Mobilität', 'Freizeit', 'Studium', 'Abos', 'Kleidung', 'Gesundheit', 'Sparen', 'Gehalt', 'BAföG', 'Sonstiges'];
const ACCOUNTS = ['Girokonto', 'Bar', 'Kreditkarte', 'Sparkonto'];

export function TransactionList({ txs }: { txs: Transaction[] }) {
  const { remove } = useStore();
  if (txs.length === 0) return <Empty>Keine Buchungen.</Empty>;
  return (
    <ul className="list">
      {txs.map((t) => (
        <li key={t.id}>
          <div className="grow">
            <div className="task-title">{t.description || t.category}</div>
            <div className="meta">
              <span className="tag">{t.category}</span>
              <span>{t.account}</span>
              <span>{formatDate(t.date)}</span>
            </div>
          </div>
          <strong className={t.type === 'Einnahme' ? 'positive' : ''}>
            {t.type === 'Einnahme' ? '+' : '−'}{formatMoney(t.amount)}
          </strong>
          <button className="icon" onClick={() => remove('transactions', t.id)} aria-label="Löschen" title="Löschen">×</button>
        </li>
      ))}
    </ul>
  );
}

export function sortTx(txs: Transaction[]): Transaction[] {
  return [...txs].sort((a, b) => b.date.localeCompare(a.date));
}

export function Finance() {
  const { data, add } = useStore();
  const t = today();
  const [month, setMonth] = useState(monthKey(t));
  const [type, setType] = useState<TxType>('Ausgabe');
  const [description, setDescription] = useState('');
  const [amount, setAmount] = useState('');
  const [category, setCategory] = useState('Lebensmittel');
  const [account, setAccount] = useState('Girokonto');
  const [date, setDate] = useState(t);

  const totals = monthTotals(data.transactions, month);
  const txs = sortTx(data.transactions.filter((x) => monthKey(x.date) === month));

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
      <div className="stats">
        <Stat label="Einnahmen" value={formatMoney(totals.income)} />
        <Stat label="Ausgaben" value={formatMoney(totals.expenses)} />
        <Stat label="Saldo" value={formatMoney(totals.balance)} hint={totals.balance >= 0 ? 'im Plus 👍' : 'im Minus'} />
      </div>
      <Panel title="Buchung erfassen">
        <form
          className="inline-form"
          onSubmit={(e) => {
            e.preventDefault();
            const value = Number(amount.replace(',', '.'));
            if (!(value > 0)) return;
            add('transactions', { type, description: description.trim(), amount: Math.round(value * 100) / 100, category, account, date });
            setDescription('');
            setAmount('');
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
          <button className="primary" type="submit">Hinzufügen</button>
        </form>
      </Panel>
      <div className="grid-2">
        <Panel title="Ausgaben nach Kategorie">
          {totals.byCategory.length === 0 ? <Empty>Keine Ausgaben in diesem Monat.</Empty> : (
            <ul className="list">
              {totals.byCategory.map((c) => (
                <li key={c.category} className="col">
                  <div className="row between"><span>{c.category}</span><span>{formatMoney(c.amount)}</span></div>
                  <Progress value={(c.amount / totals.expenses) * 100} />
                </li>
              ))}
            </ul>
          )}
        </Panel>
        <Panel title={`${txs.length} Buchungen`}>
          <TransactionList txs={txs} />
        </Panel>
      </div>
    </>
  );
}
