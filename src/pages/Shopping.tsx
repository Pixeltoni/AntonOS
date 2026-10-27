import { useState } from 'react';
import { useStore } from '../store';
import type { ShoppingItem, WidgetVariant } from '../types';
import { today } from '../lib/dates';
import { formatMoney } from '../lib/life';
import { AISLES, categorize, parseShopping, rememberBought } from '../lib/shopping';
import { Empty, PageHeader, Panel } from '../components/ui';
import { useToast } from '../components/toast';

const aisleOf = (id: string) => AISLES.find((a) => a.id === id) ?? AISLES[AISLES.length - 1];

/** Neue Artikel – mehrere auf einmal: „Milch, 6 Eier, 500 g Hack“ */
function useAddItems() {
  const { data, add, update } = useStore();
  return (input: string) => {
    for (const { name, amount } of parseShopping(input)) {
      // Steht der Artikel schon offen auf der Liste, nur die Menge übernehmen
      const open = data.shopping.find((x) => !x.done && x.name.toLowerCase() === name.toLowerCase());
      if (open) {
        if (amount) update('shopping', open.id, { amount });
        continue;
      }
      add('shopping', { name, amount, aisle: categorize(name), done: false, added: today() });
    }
  };
}

function useToggleItem() {
  const { update } = useStore();
  const { show } = useToast();
  return (item: ShoppingItem) => {
    update('shopping', item.id, { done: !item.done });
    if (!item.done) show(`„${item.name}“ im Wagen`, { label: 'Widerrufen', run: () => update('shopping', item.id, { done: false }) }, 4000);
  };
}

function ItemRow({ item, compact }: { item: ShoppingItem; compact?: boolean }) {
  const { update, remove } = useStore();
  const toggle = useToggleItem();
  const [editing, setEditing] = useState(false);
  return (
    <li className={`shop-row ${item.done ? 'done' : ''}`}>
      <button type="button" className="shop-check" role="checkbox" aria-checked={item.done} aria-label={item.name} onClick={() => toggle(item)} />
      {editing && !compact ? (
        <form
          className="row grow"
          onSubmit={(e) => {
            e.preventDefault();
            setEditing(false);
          }}
        >
          <input className="narrow" value={item.amount} placeholder="Menge" onChange={(e) => update('shopping', item.id, { amount: e.target.value })} aria-label="Menge" />
          <input className="grow" autoFocus value={item.name} onChange={(e) => update('shopping', item.id, { name: e.target.value })} aria-label="Artikel" />
          <select value={item.aisle} onChange={(e) => update('shopping', item.id, { aisle: e.target.value })} aria-label="Abteilung">
            {AISLES.map((a) => <option key={a.id} value={a.id}>{a.icon} {a.label}</option>)}
          </select>
          <button type="submit">Fertig</button>
        </form>
      ) : (
        <button type="button" className="shop-name grow" onClick={() => !compact && setEditing(true)} disabled={compact}>
          {item.name}
          {item.amount && <span className="shop-amount">{item.amount}</span>}
        </button>
      )}
      {!compact && !editing && (
        <button type="button" className="icon shop-delete" onClick={() => remove('shopping', item.id)} aria-label={`${item.name} entfernen`} title="Entfernen">×</button>
      )}
    </li>
  );
}

function QuickAdd({ compact }: { compact?: boolean }) {
  const addItems = useAddItems();
  const [text, setText] = useState('');
  const preview = parseShopping(text);
  return (
    <form
      className="quick-add shop-add"
      onSubmit={(e) => {
        e.preventDefault();
        if (!text.trim()) return;
        addItems(text);
        setText('');
      }}
    >
      <div className="quick-add-row">
        <button type="submit" className="qa-plus shop-plus" aria-label="Hinzufügen" disabled={!text.trim()}>+</button>
        <input
          className="grow"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={compact ? 'Artikel hinzufügen …' : 'Artikel hinzufügen, z. B. „Milch, 6 Eier, 500 g Hack“'}
          aria-label="Artikel hinzufügen"
        />
        {!compact && preview.length > 1 && <span className="muted small">{preview.length} Artikel</span>}
      </div>
    </form>
  );
}

/** Offene Artikel nach Abteilung, wie im Supermarkt sortiert */
function ByAisle({ items, compact }: { items: ShoppingItem[]; compact?: boolean }) {
  return (
    <>
      {AISLES.map((a) => {
        const list = items.filter((x) => aisleOf(x.aisle).id === a.id);
        if (list.length === 0) return null;
        return (
          <section key={a.id} className="shop-aisle">
            <h3>{a.icon} {a.label}</h3>
            <ul className="shop-list">{list.map((x) => <ItemRow key={x.id} item={x} compact={compact} />)}</ul>
          </section>
        );
      })}
    </>
  );
}

/** Dashboard-Widget */
export function ShoppingWidget({ variant = 'standard' }: { variant?: WidgetVariant }) {
  const { data } = useStore();
  const open = data.shopping.filter((x) => !x.done);
  return (
    <div className="col">
      {variant !== 'kompakt' && <QuickAdd compact />}
      {open.length === 0 ? <Empty>Alles eingekauft 🎉</Empty> : variant === 'detail' ? (
        <ByAisle items={open} compact />
      ) : (
        <ul className="shop-list">{open.slice(0, variant === 'kompakt' ? 5 : 8).map((x) => <ItemRow key={x.id} item={x} compact />)}</ul>
      )}
      {variant !== 'detail' && open.length > (variant === 'kompakt' ? 5 : 8) && <a className="small" href="#/einkauf">+ {open.length - (variant === 'kompakt' ? 5 : 8)} weitere</a>}
    </div>
  );
}

export function Shopping() {
  const { data, mutate, updateSettings } = useStore();
  const addItems = useAddItems();
  const { show } = useToast();
  const [total, setTotal] = useState('');
  const open = data.shopping.filter((x) => !x.done);
  const done = data.shopping.filter((x) => x.done);
  const suggestions = data.settings.shoppingFrequent.filter((f) => !open.some((x) => x.name.toLowerCase() === f.name.toLowerCase())).slice(0, 12);

  /** Erledigte entfernen, als „häufig gekauft“ merken und optional als Ausgabe buchen */
  const finish = () => {
    const amount = Number(total.replace(',', '.'));
    const names = done.map((x) => x.name);
    mutate((d) => ({
      ...d,
      shopping: d.shopping.filter((x) => !x.done),
      settings: { ...d.settings, shoppingFrequent: rememberBought(d.settings.shoppingFrequent, names) },
      transactions: amount > 0
        ? [...d.transactions, { id: crypto.randomUUID(), type: 'Ausgabe', description: 'Einkauf', amount: Math.round(amount * 100) / 100, category: 'Lebensmittel', account: 'Girokonto', date: today() }]
        : d.transactions,
    }));
    show(amount > 0 ? `Einkauf abgeschlossen · ${formatMoney(amount)} als Ausgabe gebucht` : 'Einkauf abgeschlossen');
    setTotal('');
  };

  return (
    <>
      <PageHeader title="Einkaufsliste" subtitle={open.length ? `${open.length} ${open.length === 1 ? 'Artikel' : 'Artikel'} offen` : 'Alles eingekauft 🎉'} />
      <div className="grid-2">
        <Panel>
          <h1 className="rem-list-title" style={{ color: '#34C759' }}>Einkaufsliste</h1>
          <QuickAdd />
          {open.length === 0 ? <Empty>Die Liste ist leer.</Empty> : <ByAisle items={open} />}
          {done.length > 0 && (
            <details className="shop-done">
              <summary>{done.length} im Wagen</summary>
              <ul className="shop-list">{done.map((x) => <ItemRow key={x.id} item={x} />)}</ul>
            </details>
          )}
        </Panel>
        <div className="stack">
          {done.length > 0 && (
            <Panel title="🧾 Einkauf abschließen">
              <form
                className="col"
                onSubmit={(e) => {
                  e.preventDefault();
                  finish();
                }}
              >
                <p className="muted small">Entfernt die {done.length} Artikel im Wagen. Mit Betrag wird der Einkauf gleich als Ausgabe (Lebensmittel) in den Finanzen gebucht.</p>
                <div className="row">
                  <input className="grow" inputMode="decimal" placeholder="Betrag in € (optional)" value={total} onChange={(e) => setTotal(e.target.value)} aria-label="Betrag des Einkaufs" />
                  <button type="submit" className="primary">Abschließen</button>
                </div>
              </form>
            </Panel>
          )}
          <Panel title="⭐ Häufig gekauft">
            {suggestions.length === 0 ? (
              <Empty>Nach deinen ersten Einkäufen schlägt AntonOS hier vor, was du oft brauchst.</Empty>
            ) : (
              <div className="shop-suggest">
                {suggestions.map((f) => (
                  <button key={f.name} type="button" onClick={() => addItems(f.name)}>
                    {aisleOf(categorize(f.name)).icon} {f.name}
                  </button>
                ))}
              </div>
            )}
            {data.settings.shoppingFrequent.length > 0 && (
              <button type="button" className="small link-button" onClick={() => confirm('Vorschläge zurücksetzen?') && updateSettings({ shoppingFrequent: [] })}>
                Vorschläge zurücksetzen
              </button>
            )}
          </Panel>
          <Panel title="💡 Tipps">
            <ul className="muted small tips">
              <li>Mehrere Artikel auf einmal: „Milch, 6 Eier, 500 g Hack, Äpfel x3“</li>
              <li>Artikel werden automatisch nach Abteilung sortiert – antippen, um Name, Menge oder Abteilung zu ändern.</li>
              <li>Die Liste ist mit deinen Geräten synchron, wenn du angemeldet bist.</li>
            </ul>
          </Panel>
        </div>
      </div>
    </>
  );
}
