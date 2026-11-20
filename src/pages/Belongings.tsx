import { useState } from 'react';
import { useStore } from '../store';
import type { ID, Loan, LoanDirection, Warranty } from '../types';
import { formatDate, relativeLabel, today } from '../lib/dates';
import { formatMoney, safeImageSrc } from '../lib/life';
import { leftLabel, loanStatus, loanWho, openLoans, sortWarranties, WARRANTY_OPTIONS, warrantyEnd, warrantyStatus } from '../lib/belongings';
import { Empty, PageHeader, Panel } from '../components/ui';
import { AddButton, Sheet } from '../components/sheet';
import { ImageInput } from '../components/widgets';
import { useToast } from '../components/toast';
import { Avatar } from './People';

const parseAmount = (raw: string) => {
  const v = Number(raw.trim().replace(/\s|€/g, '').replace(/\.(?=\d{3}\b)/g, '').replace(',', '.'));
  return Number.isFinite(v) && v > 0 ? Math.round(v * 100) / 100 : 0;
};

type LoanDraft = Omit<Loan, 'id'>;
export const blankLoan = (direction: LoanDirection = 'verliehen', personId: ID | null = null): LoanDraft => ({ title: '', direction, personId, who: '', date: today(), due: null, returned: null, note: '' });

function DirectionPicker({ value, onChange }: { value: LoanDirection; onChange: (v: LoanDirection) => void }) {
  return (
    <div className="segmented" role="radiogroup" aria-label="Richtung">
      <button type="button" role="radio" aria-checked={value === 'verliehen'} className={value === 'verliehen' ? 'selected' : ''} onClick={() => onChange('verliehen')}>Verliehen</button>
      <button type="button" role="radio" aria-checked={value === 'geliehen'} className={value === 'geliehen' ? 'selected' : ''} onClick={() => onChange('geliehen')}>Geliehen</button>
    </div>
  );
}

/** Leihe anlegen oder bearbeiten */
export function LoanSheet({ initial, id, onClose }: { initial: LoanDraft; id?: ID; onClose: () => void }) {
  const { data, add, update, remove } = useStore();
  const [d, setD] = useState(initial);
  const set = <K extends keyof LoanDraft>(k: K, v: LoanDraft[K]) => setD((x) => ({ ...x, [k]: v }));
  const people = [...data.people].sort((a, b) => a.name.localeCompare(b.name));
  const hasWho = !!d.personId || !!d.who.trim();
  return (
    <Sheet
      title={id ? 'Bearbeiten' : d.direction === 'verliehen' ? 'Verliehen' : 'Geliehen'}
      submitLabel={id ? 'Sichern' : 'Hinzufügen'}
      submitDisabled={!d.title.trim() || !hasWho}
      onClose={onClose}
      onSubmit={() => {
        const next = { ...d, title: d.title.trim(), who: d.personId ? '' : d.who.trim() };
        if (id) update('loans', id, next);
        else add('loans', next);
        onClose();
      }}
    >
      <DirectionPicker value={d.direction} onChange={(v) => set('direction', v)} />
      <div className="form-grid">
        <label className="full">Was<input value={d.title} onChange={(e) => set('title', e.target.value)} placeholder="z. B. Buch, Bohrmaschine, 20 €" autoFocus={!id} /></label>
        <label>{d.direction === 'verliehen' ? 'An' : 'Von'}
          <select value={d.personId ?? ''} onChange={(e) => set('personId', e.target.value || null)}>
            <option value="">Andere Person …</option>
            {people.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </label>
        {!d.personId && <label>Name<input value={d.who} onChange={(e) => set('who', e.target.value)} placeholder="z. B. Jonas" /></label>}
        <label>Seit<input type="date" value={d.date} onChange={(e) => e.target.value && set('date', e.target.value)} /></label>
        <label>Zurück bis<input type="date" value={d.due ?? ''} onChange={(e) => set('due', e.target.value || null)} /></label>
        {id && <label>Zurückbekommen am<input type="date" value={d.returned ?? ''} onChange={(e) => set('returned', e.target.value || null)} /></label>}
        <label className="full">Notiz<input value={d.note} onChange={(e) => set('note', e.target.value)} placeholder="optional" /></label>
      </div>
      <p className="muted small">Mit „Zurück bis“ erinnert dich Daywerk am Tag selbst.</p>
      {id && <button type="button" className="danger" onClick={() => { if (confirm(`„${d.title}“ löschen?`)) { remove('loans', id); onClose(); } }}>Löschen</button>}
    </Sheet>
  );
}

function LoanRow({ loan, showWho = true, onOpen }: { loan: Loan; showWho?: boolean; onOpen: () => void }) {
  const { data, update } = useStore();
  const { show } = useToast();
  const t = today();
  const s = loanStatus(loan, t);
  const person = loan.personId ? data.people.find((p) => p.id === loan.personId) : undefined;
  const who = loanWho(loan, data.people);
  const back = () => {
    update('loans', loan.id, { returned: t });
    show(`${loan.title} ist zurück`, { label: 'Widerrufen', run: () => update('loans', loan.id, { returned: null }) });
  };
  return (
    <li className={loan.returned ? 'done' : ''}>
      {showWho && <Avatar person={{ name: who, color: person?.color ?? '' }} size={32} />}
      <button type="button" className="abo-open grow" onClick={onOpen}>
        <span className="abo-text">
          <span className="task-title">{loan.title}</span>
          <span className="meta">
            <span>{loan.direction === 'verliehen' ? `bei ${who}` : `von ${who}`}</span>
            {loan.returned ? <span>zurück am {formatDate(loan.returned)}</span> : <span>seit {formatDate(loan.date)}</span>}
            {s.daysLeft !== null && <span className={s.state === 'ueberfaellig' || s.state === 'faellig' ? 'abo-warn' : ''}>{s.state === 'ueberfaellig' ? `seit ${formatDate(loan.due!)} überfällig` : `zurück ${relativeLabel(loan.due!, t)}`}</span>}
          </span>
        </span>
      </button>
      {!loan.returned && <button type="button" className="small-pill" onClick={back}>Zurück</button>}
    </li>
  );
}

/** Liste mit offenen Leihen und den letzten zurückgegebenen (eingeklappt) */
function LoanList({ loans, showWho, onOpen, emptyText }: { loans: Loan[]; showWho?: boolean; onOpen: (l: Loan) => void; emptyText: string }) {
  const open = openLoans(loans);
  const done = loans.filter((l) => l.returned).sort((a, b) => (b.returned ?? '').localeCompare(a.returned ?? '')).slice(0, 20);
  return (
    <>
      {open.length === 0 ? <Empty>{emptyText}</Empty> : <ul className="list">{open.map((l) => <LoanRow key={l.id} loan={l} showWho={showWho} onOpen={() => onOpen(l)} />)}</ul>}
      {done.length > 0 && (
        <details className="belong-done">
          <summary>Zurückgegeben ({done.length})</summary>
          <ul className="list dense">{done.map((l) => <LoanRow key={l.id} loan={l} showWho={showWho} onOpen={() => onOpen(l)} />)}</ul>
        </details>
      )}
    </>
  );
}

/** Auf der Seite eines Menschen: was ihr euch gegenseitig geliehen habt */
export function PersonLoans({ personId, name }: { personId: ID; name: string }) {
  const { data } = useStore();
  const [sheet, setSheet] = useState<{ initial: LoanDraft; id?: ID } | null>(null);
  const loans = data.loans.filter((l) => l.personId === personId);
  return (
    <Panel title="Verliehen & geliehen" actions={<button type="button" className="small-pill" onClick={() => setSheet({ initial: blankLoan('verliehen', personId) })}>+ Eintragen</button>}>
      <LoanList loans={loans} showWho={false} onOpen={(l) => setSheet({ initial: l, id: l.id })} emptyText={`Nichts offen zwischen dir und ${name.split(' ')[0]}.`} />
      {sheet && <LoanSheet initial={sheet.initial} id={sheet.id} onClose={() => setSheet(null)} />}
    </Panel>
  );
}

type WarrantyDraft = Omit<Warranty, 'id'>;
export const blankWarranty = (patch: Partial<WarrantyDraft> = {}): WarrantyDraft => {
  const bought = patch.bought ?? today();
  const months = patch.months ?? 24;
  return { title: '', store: '', bought, months, until: warrantyEnd(bought, months), price: 0, photo: '', note: '', ...patch };
};

/** Garantie anlegen oder bearbeiten */
export function WarrantySheet({ initial, id, onClose }: { initial: WarrantyDraft; id?: ID; onClose: () => void }) {
  const { add, update, remove } = useStore();
  const [d, setD] = useState(initial);
  const [price, setPrice] = useState(initial.price ? String(initial.price).replace('.', ',') : '');
  const set = <K extends keyof WarrantyDraft>(k: K, v: WarrantyDraft[K]) => setD((x) => ({ ...x, [k]: v }));
  // Kaufdatum oder Garantiezeit ändern → Ende neu rechnen
  const setPeriod = (bought: string, months: number) => setD((x) => ({ ...x, bought, months, until: warrantyEnd(bought, months) }));
  const known = WARRANTY_OPTIONS.some((o) => o.months === d.months);
  const img = safeImageSrc(d.photo);
  return (
    <Sheet
      title={id ? 'Garantie bearbeiten' : 'Neue Garantie'}
      submitLabel={id ? 'Sichern' : 'Hinzufügen'}
      submitDisabled={!d.title.trim()}
      onClose={onClose}
      onSubmit={() => {
        const next = { ...d, title: d.title.trim(), store: d.store.trim(), price: parseAmount(price) };
        if (id) update('warranties', id, next);
        else add('warranties', next);
        onClose();
      }}
    >
      <div className="form-grid">
        <label className="full">Was<input value={d.title} onChange={(e) => set('title', e.target.value)} placeholder="z. B. Kopfhörer, Laptop, Waschmaschine" autoFocus={!id} /></label>
        <label>Gekauft bei<input value={d.store} onChange={(e) => set('store', e.target.value)} placeholder="z. B. MediaMarkt" /></label>
        <label>Preis in €<input inputMode="decimal" value={price} onChange={(e) => setPrice(e.target.value)} placeholder="optional" /></label>
        <label>Gekauft am<input type="date" value={d.bought} onChange={(e) => e.target.value && setPeriod(e.target.value, d.months)} /></label>
        <label>Garantie
          <select value={known ? d.months : 'eigene'} onChange={(e) => e.target.value !== 'eigene' && setPeriod(d.bought, Number(e.target.value))}>
            {WARRANTY_OPTIONS.map((o) => <option key={o.months} value={o.months}>{o.label}</option>)}
            {!known && <option value="eigene">{d.months} Monate</option>}
          </select>
        </label>
        <label>Endet am<input type="date" value={d.until} onChange={(e) => e.target.value && set('until', e.target.value)} /></label>
        <div className="full">
          <span className="muted small">Beleg (Foto vom Kassenzettel oder der Rechnung)</span>
          <ImageInput value={d.photo} onChange={(v) => set('photo', v)} label="Beleg" maxSize={1400} />
          {img && <img className="belong-receipt" src={img} alt="Beleg" />}
        </div>
        <label className="full">Notiz<input value={d.note} onChange={(e) => set('note', e.target.value)} placeholder="z. B. Seriennummer, Bestellnummer" /></label>
      </div>
      <p className="muted small">Einen Monat vor dem Ende erinnert dich Daywerk, damit du Mängel noch rechtzeitig meldest.</p>
      {id && <button type="button" className="danger" onClick={() => { if (confirm(`Garantie „${d.title}“ löschen?`)) { remove('warranties', id); onClose(); } }}>Löschen</button>}
    </Sheet>
  );
}

function WarrantyRow({ w, onOpen }: { w: Warranty; onOpen: () => void }) {
  const t = today();
  const s = warrantyStatus(w, t);
  const img = safeImageSrc(w.photo);
  return (
    <li className={s.state === 'abgelaufen' ? 'belong-expired' : ''}>
      <button type="button" className="abo-open grow" onClick={onOpen}>
        {img ? <img className="belong-thumb" src={img} alt="" /> : <span className="abo-icon belong-icon" aria-hidden>{w.title.trim().charAt(0).toUpperCase() || '?'}</span>}
        <span className="grow abo-text">
          <span className="task-title">{w.title}</span>
          <span className="meta">
            {w.store && <span>{w.store}</span>}
            <span>gekauft {formatDate(w.bought)}</span>
            {w.price > 0 && <span>{formatMoney(w.price)}</span>}
          </span>
        </span>
        <span className="abo-amount">
          <strong className={s.state === 'bald' ? 'abo-warn' : s.state === 'abgelaufen' ? 'muted' : ''}>{leftLabel(s.daysLeft)}</strong>
          <span className="muted small">bis {formatDate(w.until)}</span>
        </span>
      </button>
    </li>
  );
}

export function Belongings() {
  const { data } = useStore();
  const t = today();
  const [loanSheet, setLoanSheet] = useState<{ initial: LoanDraft; id?: ID } | null>(null);
  const [warrantySheet, setWarrantySheet] = useState<{ initial: WarrantyDraft; id?: ID } | null>(null);
  const out = openLoans(data.loans).filter((l) => l.direction === 'verliehen');
  const borrowed = openLoans(data.loans).filter((l) => l.direction === 'geliehen');
  const { running, expired } = sortWarranties(data.warranties, t);
  const subtitle = [out.length ? `${out.length} verliehen` : '', borrowed.length ? `${borrowed.length} geliehen` : '', running.length ? `${running.length} ${running.length === 1 ? 'Garantie läuft' : 'Garantien laufen'}` : ''].filter(Boolean).join(' · ');
  return (
    <>
      <PageHeader title="Verliehen & Garantien" subtitle={subtitle || 'Wer was von dir hat und wie lange die Garantie noch läuft'} actions={<AddButton label="Verliehen eintragen" onClick={() => setLoanSheet({ initial: blankLoan() })} />} />
      <div className="grid-2">
        <div className="stack">
          <Panel title="Verliehen" actions={<button type="button" className="small-pill" onClick={() => setLoanSheet({ initial: blankLoan('verliehen') })}>+ Verliehen</button>}>
            <LoanList loans={data.loans.filter((l) => l.direction === 'verliehen')} onOpen={(l) => setLoanSheet({ initial: l, id: l.id })} emptyText="Gerade hat niemand etwas von dir." />
          </Panel>
          <Panel title="Geliehen" actions={<button type="button" className="small-pill" onClick={() => setLoanSheet({ initial: blankLoan('geliehen') })}>+ Geliehen</button>}>
            <LoanList loans={data.loans.filter((l) => l.direction === 'geliehen')} onOpen={(l) => setLoanSheet({ initial: l, id: l.id })} emptyText="Du hast gerade nichts ausgeliehen." />
          </Panel>
        </div>
        <Panel title="Garantien" actions={<button type="button" className="small-pill" onClick={() => setWarrantySheet({ initial: blankWarranty() })}>+ Garantie</button>}>
          {running.length === 0 ? <Empty>Noch keine Garantie gespeichert. Trag größere Käufe mit Foto vom Beleg ein – oder hak beim Kassenzettel-Scan „Garantie merken“ an.</Empty> : (
            <ul className="list">{running.map((w) => <WarrantyRow key={w.id} w={w} onOpen={() => setWarrantySheet({ initial: w, id: w.id })} />)}</ul>
          )}
          {expired.length > 0 && (
            <details className="belong-done">
              <summary>Abgelaufen ({expired.length})</summary>
              <ul className="list dense">{expired.map((w) => <WarrantyRow key={w.id} w={w} onOpen={() => setWarrantySheet({ initial: w, id: w.id })} />)}</ul>
            </details>
          )}
        </Panel>
      </div>
      {loanSheet && <LoanSheet initial={loanSheet.initial} id={loanSheet.id} onClose={() => setLoanSheet(null)} />}
      {warrantySheet && <WarrantySheet initial={warrantySheet.initial} id={warrantySheet.id} onClose={() => setWarrantySheet(null)} />}
    </>
  );
}
