import { useState } from 'react';
import { useStore, newId } from '../store';
import type { DateStr, ID, PackItem, Trip, TripLegKind } from '../types';
import { formatDate, parseDate, today } from '../lib/dates';
import { formatMoney } from '../lib/life';
import { applyTemplate, LEG_KINDS, nextTrip, PACK_TEMPLATES, packProgress, packSections, sortLegs, tripBudget, tripDays, tripPhase } from '../lib/trips';
import { Empty, PageHeader, Panel, Progress } from '../components/ui';
import { Cover, ImageInput } from '../components/widgets';
import { AddButton, Sheet } from '../components/sheet';
import { useToast } from '../components/toast';

type Draft = Omit<Trip, 'id'>;
const blank = (): Draft => ({ title: '', start: today(), end: today(), cover: '', budget: 0, legs: [], packing: [], note: '' });
const SECTIONS = ['Dokumente', 'Kleidung', 'Hygiene', 'Technik', 'Ausrüstung', 'Sonstiges'];

const short = (d: DateStr) => parseDate(d).toLocaleDateString('de-DE', { day: 'numeric', month: 'short' });
const range = (t: Pick<Trip, 'start' | 'end'>) => (t.start === t.end ? formatDate(t.start) : `${short(t.start)} – ${parseDate(t.end).toLocaleDateString('de-DE', { day: 'numeric', month: 'short', year: 'numeric' })}`);

const parseAmount = (raw: string) => {
  const v = Number(raw.trim().replace(/\s|€/g, '').replace(/\.(?=\d{3}\b)/g, '').replace(',', '.'));
  return Number.isFinite(v) ? Math.round(v * 100) / 100 : 0;
};

/** „noch 15 Tage“, „Tag 2 von 5“, „vorbei“ */
function phaseLabel(trip: Trip, on: DateStr): string {
  const p = tripPhase(trip, on);
  if (p.phase === 'bald') return p.days === 1 ? 'morgen geht’s los' : `noch ${p.days} Tage`;
  if (p.phase === 'unterwegs') return `Tag ${p.days} von ${tripDays(trip)}`;
  return 'vorbei';
}

/** Kleiner Ring für den Packfortschritt */
function PackRing({ done, total, size = 44 }: { done: number; total: number; size?: number }) {
  const r = size / 2 - 4;
  const c = 2 * Math.PI * r;
  const share = total ? done / total : 0;
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-label={`${done} von ${total} gepackt`}>
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--ring-track)" strokeWidth="6" />
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#0A84A8" strokeWidth="6" strokeLinecap="round" strokeDasharray={`${share * c} ${c}`} transform={`rotate(-90 ${size / 2} ${size / 2})`} />
    </svg>
  );
}

function TripSheet({ initial, id, onClose }: { initial: Draft; id?: ID; onClose: () => void }) {
  const { add, update } = useStore();
  const [d, setD] = useState(initial);
  const [budget, setBudget] = useState(initial.budget ? String(initial.budget).replace('.', ',') : '');
  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setD((x) => ({ ...x, [k]: v }));
  const invalid = !d.title.trim() || !d.start || d.end < d.start;
  return (
    <Sheet
      title={id ? 'Reise bearbeiten' : 'Neue Reise'}
      submitLabel={id ? 'Sichern' : 'Anlegen'}
      submitDisabled={invalid}
      onClose={onClose}
      onSubmit={() => {
        const next = { ...d, title: d.title.trim(), budget: Math.max(0, parseAmount(budget)) };
        if (id) update('trips', id, next);
        else location.hash = `#/reisen/${add('trips', next)}`;
        onClose();
      }}
    >
      <div className="form-grid">
        <label className="full">Wohin?<input value={d.title} onChange={(e) => set('title', e.target.value)} placeholder="z. B. Lissabon" autoFocus={!id} /></label>
        <label>Von<input type="date" value={d.start} onChange={(e) => { const v = e.target.value; if (v) setD((x) => ({ ...x, start: v, end: x.end < v ? v : x.end })); }} /></label>
        <label>Bis<input type="date" value={d.end} min={d.start} onChange={(e) => e.target.value && set('end', e.target.value)} /></label>
        <label>Reisebudget in €<input inputMode="decimal" value={budget} onChange={(e) => setBudget(e.target.value)} placeholder="optional" /></label>
        <label className="full">Titelbild<ImageInput value={d.cover} onChange={(v) => set('cover', v)} /></label>
      </div>
      {d.end < d.start && <p className="small abo-warn">Das Ende liegt vor dem Start.</p>}
    </Sheet>
  );
}

function TripCard({ trip }: { trip: Trip }) {
  const t = today();
  const { done, total } = packProgress(trip.packing);
  const phase = tripPhase(trip, t).phase;
  return (
    <a className={`gallery-card ${phase === 'vorbei' ? 'past' : ''}`} href={`#/reisen/${trip.id}`}>
      <Cover src={trip.cover} seed={trip.id} emoji="✈️" />
      <div className="gallery-body">
        <strong>{trip.title}</strong>
        <div className="meta"><span>{range(trip)}</span><span className="tag">{phaseLabel(trip, t)}</span></div>
        {total > 0 && phase !== 'vorbei' && <div className="meta"><span>{done} von {total} gepackt</span></div>}
      </div>
    </a>
  );
}

export function Trips() {
  const { data } = useStore();
  const t = today();
  const [adding, setAdding] = useState(false);
  const upcoming = data.trips.filter((x) => x.end >= t).sort((a, b) => a.start.localeCompare(b.start));
  const past = data.trips.filter((x) => x.end < t).sort((a, b) => b.start.localeCompare(a.start));
  return (
    <>
      <PageHeader title="Reisen" subtitle={upcoming[0] ? `${upcoming[0].title}: ${phaseLabel(upcoming[0], t)}` : 'Ablauf, Packliste und Reisebudget'} actions={<AddButton label="Neue Reise" onClick={() => setAdding(true)} />} />
      {upcoming.length === 0 ? <Empty>Keine Reise geplant. Tipp auf „+“ und leg die nächste an – sie erscheint auch im Kalender.</Empty> : (
        <div className="gallery">{upcoming.map((x) => <TripCard key={x.id} trip={x} />)}</div>
      )}
      {past.length > 0 && (
        <details className="trips-past">
          <summary>{past.length} vergangene {past.length === 1 ? 'Reise' : 'Reisen'}</summary>
          <div className="gallery">{past.map((x) => <TripCard key={x.id} trip={x} />)}</div>
        </details>
      )}
      {adding && <TripSheet initial={blank()} onClose={() => setAdding(false)} />}
    </>
  );
}

function LegForm({ trip }: { trip: Trip }) {
  const { update } = useStore();
  const [kind, setKind] = useState<TripLegKind>('flug');
  const [title, setTitle] = useState('');
  const [date, setDate] = useState(trip.start);
  const [time, setTime] = useState('');
  const [detail, setDetail] = useState('');
  return (
    <form
      className="inline-form"
      onSubmit={(e) => {
        e.preventDefault();
        if (!title.trim()) return;
        update('trips', trip.id, { legs: [...trip.legs, { id: newId(), kind, title: title.trim(), date, time, detail: detail.trim() }] });
        setTitle('');
        setTime('');
        setDetail('');
      }}
    >
      <select value={kind} onChange={(e) => setKind(e.target.value as TripLegKind)} aria-label="Art">
        {(Object.keys(LEG_KINDS) as TripLegKind[]).map((k) => <option key={k} value={k}>{LEG_KINDS[k].label}</option>)}
      </select>
      <input className="grow" value={title} onChange={(e) => setTitle(e.target.value)} placeholder={kind === 'unterkunft' ? 'z. B. Hostel in Alfama' : 'z. B. Flug MUC → LIS'} aria-label="Titel" />
      <input type="date" value={date} onChange={(e) => e.target.value && setDate(e.target.value)} aria-label="Datum" />
      <input type="time" value={time} onChange={(e) => setTime(e.target.value)} aria-label="Uhrzeit" />
      <input className="grow" value={detail} onChange={(e) => setDetail(e.target.value)} placeholder="Gleis, Platz, Buchungsnr. …" aria-label="Details" />
      <button type="submit" disabled={!title.trim()}>Hinzufügen</button>
    </form>
  );
}

function PackList({ trip }: { trip: Trip }) {
  const { data, update, updateSettings } = useStore();
  const { show } = useToast();
  const [title, setTitle] = useState('');
  const [section, setSection] = useState('Sonstiges');
  const { done, total } = packProgress(trip.packing);
  const own = data.settings.packTemplates ?? [];
  const setPacking = (packing: PackItem[]) => update('trips', trip.id, { packing });
  return (
    <Panel
      title="Packliste"
      actions={total > 0 && <span className="row"><PackRing done={done} total={total} size={34} /><span className="muted small">{done}/{total}</span></span>}
    >
      <div className="row wrap pack-templates">
        <span className="muted small">Vorlage:</span>
        {[...PACK_TEMPLATES, ...own].map((tpl) => (
          <button key={tpl.name} type="button" className="small-pill" onClick={() => { setPacking(applyTemplate(trip.packing, tpl, newId)); show(`Vorlage „${tpl.name}“ übernommen`); }}>{tpl.name}</button>
        ))}
      </div>
      <form
        className="inline-form"
        onSubmit={(e) => {
          e.preventDefault();
          if (!title.trim()) return;
          setPacking([...trip.packing, { id: newId(), title: title.trim(), section, done: false }]);
          setTitle('');
        }}
      >
        <input className="grow" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Gegenstand, z. B. Powerbank" aria-label="Gegenstand" />
        <select value={section} onChange={(e) => setSection(e.target.value)} aria-label="Abschnitt">
          {SECTIONS.map((s) => <option key={s}>{s}</option>)}
        </select>
        <button type="submit" disabled={!title.trim()}>+ Gegenstand</button>
      </form>
      {total === 0 ? <Empty>Noch leer – übernimm eine Vorlage oder trag selbst ein.</Empty> : packSections(trip.packing).map(({ section: name, items }) => (
        <section key={name} className="pack-section">
          <h3>{name}</h3>
          <ul className="list dense">
            {items.map((p) => (
              <li key={p.id} className={p.done ? 'done' : ''}>
                <button type="button" className="pack-check" role="checkbox" aria-checked={p.done} aria-label={`${p.title} gepackt`} onClick={() => setPacking(trip.packing.map((x) => (x.id === p.id ? { ...x, done: !x.done } : x)))} />
                <span className="grow">{p.title}</span>
                <button type="button" className="icon" aria-label={`${p.title} entfernen`} onClick={() => setPacking(trip.packing.filter((x) => x.id !== p.id))}>×</button>
              </li>
            ))}
          </ul>
        </section>
      ))}
      {total > 0 && (
        <div className="row wrap">
          <button
            type="button"
            onClick={() => {
              const name = prompt('Name der Vorlage', trip.title)?.trim();
              if (!name) return;
              const items = trip.packing.map((p) => ({ title: p.title, section: p.section }));
              updateSettings({ packTemplates: [...own.filter((x) => x.name !== name), { name, items }] });
              show(`Als Vorlage „${name}“ gespeichert`);
            }}
          >
            Als Vorlage speichern
          </button>
          {done > 0 && <button type="button" onClick={() => setPacking(trip.packing.map((p) => ({ ...p, done: false })))}>Alle Haken entfernen</button>}
          {own.length > 0 && (
            <select value="" onChange={(e) => { const name = e.target.value; if (name && confirm(`Vorlage „${name}“ löschen?`)) updateSettings({ packTemplates: own.filter((x) => x.name !== name) }); }} aria-label="Eigene Vorlage löschen">
              <option value="">Eigene Vorlage löschen …</option>
              {own.map((o) => <option key={o.name} value={o.name}>{o.name}</option>)}
            </select>
          )}
        </div>
      )}
    </Panel>
  );
}

function TripSpending({ trip }: { trip: Trip }) {
  const { data, add, remove } = useStore();
  const t = today();
  const [desc, setDesc] = useState('');
  const [amount, setAmount] = useState('');
  const txs = data.transactions.filter((x) => x.tripId === trip.id).sort((a, b) => b.date.localeCompare(a.date));
  const b = tripBudget(trip, data.transactions, t);
  const date = t < trip.start ? t : t > trip.end ? trip.end : t;
  return (
    <Panel title="Ausgaben">
      {trip.budget > 0 && <Progress value={(b.spent / trip.budget) * 100} color={b.left < 0 ? 'var(--danger)' : '#0A84A8'} />}
      <form
        className="inline-form"
        onSubmit={(e) => {
          e.preventDefault();
          const v = parseAmount(amount);
          if (!(v > 0)) return;
          add('transactions', { type: 'Ausgabe', description: desc.trim() || trip.title, amount: v, category: 'Reisen', account: 'Girokonto', date, tripId: trip.id });
          setDesc('');
          setAmount('');
        }}
      >
        <input className="grow" value={desc} onChange={(e) => setDesc(e.target.value)} placeholder="z. B. Flug, Hostel, Essen" aria-label="Wofür?" />
        <input className="narrow" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="€" aria-label="Betrag in Euro" />
        <button type="submit">Buchen</button>
      </form>
      {txs.length === 0 ? <Empty>Noch keine Ausgaben. Sie landen auch in den Finanzen (Kategorie Reisen).</Empty> : (
        <ul className="list dense">
          {txs.map((x) => (
            <li key={x.id}>
              <span className="grow">{x.description}</span>
              <span className="muted small">{short(x.date)}</span>
              <strong>{formatMoney(x.amount)}</strong>
              <button type="button" className="icon" aria-label={`${x.description} löschen`} onClick={() => confirm(`„${x.description}“ löschen?`) && remove('transactions', x.id)}>×</button>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}

export function TripDetail({ id }: { id: ID }) {
  const { data, update, remove } = useStore();
  const t = today();
  const trip = data.trips.find((x) => x.id === id);
  const [editing, setEditing] = useState(false);
  if (!trip) return <Empty>Reise nicht gefunden. <a href="#/reisen">Zurück</a></Empty>;

  const b = tripBudget(trip, data.transactions, t);
  const legs = sortLegs(trip.legs);
  const nights = tripDays(trip) - 1;
  return (
    <>
      <div className="trip-hero">
        <Cover src={trip.cover} seed={trip.id} emoji="✈️" className="banner" />
        <div className="trip-hero-title">
          <span>{range(trip)}{nights > 0 ? ` · ${nights} ${nights === 1 ? 'Nacht' : 'Nächte'}` : ''}</span>
          <h1>{trip.title}</h1>
        </div>
      </div>
      <div className="row wrap trip-actions">
        <a className="button" href="#/reisen">‹ Reisen</a>
        <span className="grow" />
        <button onClick={() => setEditing(true)}>Bearbeiten</button>
        <button className="danger" onClick={() => { if (confirm(`Reise „${trip.title}“ löschen? Gebuchte Ausgaben bleiben in den Finanzen.`)) { remove('trips', id); location.hash = '#/reisen'; } }}>Löschen</button>
      </div>
      <div className="trip-stats">
        <div className="trip-stat"><strong>{phaseLabel(trip, t)}</strong><span className="muted small">{tripPhase(trip, t).phase === 'bald' ? `bis ${formatDate(trip.start)}` : formatDate(trip.end)}</span></div>
        {trip.budget > 0 ? (
          <div className="trip-stat"><strong className={b.left < 0 ? 'negative' : ''}>{formatMoney(b.left)}</strong><span className="muted small">von {formatMoney(trip.budget)} übrig{b.perDay > 0 ? ` · ${formatMoney(b.perDay)} pro Tag` : ''}</span></div>
        ) : (
          <div className="trip-stat"><strong>{formatMoney(b.spent)}</strong><span className="muted small">ausgegeben</span></div>
        )}
        <div className="trip-stat"><strong>{packProgress(trip.packing).done}/{packProgress(trip.packing).total}</strong><span className="muted small">gepackt</span></div>
      </div>
      <div className="grid-2">
        <div className="stack">
          <Panel title="Ablauf">
            {legs.length === 0 ? <Empty>Trag Flug, Zug oder Unterkunft ein – mit Uhrzeit, Gleis oder Buchungsnummer.</Empty> : (
              <ol className="trip-timeline">
                {legs.map((l) => (
                  <li key={l.id} style={{ ['--c' as string]: LEG_KINDS[l.kind].color }}>
                    <span className="trip-dot" aria-hidden />
                    <div className="grow">
                      <div className="task-title">{l.title}</div>
                      <div className="meta">
                        <span>{LEG_KINDS[l.kind].label}</span>
                        <span>{formatDate(l.date)}{l.time ? ` · ${l.time}` : ''}</span>
                        {l.detail && <span>{l.detail}</span>}
                      </div>
                    </div>
                    <button type="button" className="icon" aria-label={`${l.title} löschen`} onClick={() => update('trips', id, { legs: trip.legs.filter((x) => x.id !== l.id) })}>×</button>
                  </li>
                ))}
              </ol>
            )}
            <LegForm trip={trip} />
          </Panel>
          <TripSpending trip={trip} />
          <Panel title="Notiz">
            <textarea rows={3} value={trip.note} onChange={(e) => update('trips', id, { note: e.target.value })} placeholder="Ideen, Adressen, Restaurants …" aria-label="Notiz zur Reise" />
          </Panel>
        </div>
        <PackList trip={trip} />
      </div>
      {editing && <TripSheet initial={trip} id={id} onClose={() => setEditing(false)} />}
    </>
  );
}

/** Dashboard-Widget: Countdown bis zur nächsten Reise */
export function TripWidget() {
  const { data } = useStore();
  const t = today();
  const trip = nextTrip(data.trips, t);
  if (!trip) return <Empty>Keine Reise geplant. <a href="#/reisen">Reise anlegen</a></Empty>;
  const { done, total } = packProgress(trip.packing);
  return (
    <a className="trip-widget" href={`#/reisen/${trip.id}`}>
      <span className="muted small">{range(trip)}</span>
      <strong className="trip-widget-title">{trip.title}</strong>
      <span className="trip-widget-count">{phaseLabel(trip, t)}</span>
      {total > 0 && <span className="row small"><PackRing done={done} total={total} size={26} /> {done} von {total} gepackt</span>}
    </a>
  );
}
