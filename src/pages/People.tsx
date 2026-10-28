import { useState } from 'react';
import { useStore, newId } from '../store';
import type { ID, Person, WidgetVariant } from '../types';
import { daysBetween, formatDate, parseDate, today } from '../lib/dates';
import { birthdayIn, CONTACT_INTERVALS, contactDue, daysLabel, initials, nextBirthday, PERSON_COLORS, PERSON_GROUPS, sinceLabel, upcomingBirthdays, ageOn, birthdayFromDate } from '../lib/people';
import { Empty, PageHeader, Panel } from '../components/ui';
import { AddButton, Sheet } from '../components/sheet';

type Draft = Omit<Person, 'id'>;
const blank = (count: number): Draft => ({ name: '', birthday: '', birthYear: null, group: 'Freunde', note: '', color: PERSON_COLORS[count % PERSON_COLORS.length], gifts: [], contactEvery: 0, lastContact: null, meetings: [] });

const birthdayText = (p: Pick<Person, 'birthday'>) => (p.birthday ? parseDate(birthdayIn(p.birthday, 2000)).toLocaleDateString('de-DE', { day: 'numeric', month: 'long' }) : '');

export function Avatar({ person, size = 36 }: { person: Pick<Person, 'name' | 'color'>; size?: number }) {
  return (
    <span className="avatar" style={{ background: person.color || '#8E8E93', width: size, height: size, fontSize: size * 0.38 }} aria-hidden>
      {initials(person.name)}
    </span>
  );
}

/** Kleiner Ring, der sich bis zum Geburtstag füllt (eine Woche) */
function CountdownRing({ person, days, size = 46 }: { person: Person; days: number; size?: number }) {
  const r = size / 2 - 2;
  const c = 2 * Math.PI * r;
  const share = Math.max(0, Math.min(1, 1 - days / 7));
  return (
    <span className="bday-ring" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--ring-track)" strokeWidth="3" />
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={person.color || 'var(--accent)'} strokeWidth="3" strokeLinecap="round" strokeDasharray={`${share * c} ${c}`} transform={`rotate(-90 ${size / 2} ${size / 2})`} />
      </svg>
      <Avatar person={person} size={size - 12} />
    </span>
  );
}

function PersonSheet({ initial, id, onClose }: { initial: Draft; id?: ID; onClose: () => void }) {
  const { add, update } = useStore();
  const [d, setD] = useState(initial);
  const [date, setDate] = useState(initial.birthday ? `${initial.birthYear ?? 2000}-${initial.birthday}` : '');
  const [yearKnown, setYearKnown] = useState(!initial.birthday || initial.birthYear !== null);
  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setD((x) => ({ ...x, [k]: v }));
  return (
    <Sheet
      title={id ? 'Bearbeiten' : 'Neuer Mensch'}
      submitLabel={id ? 'Sichern' : 'Hinzufügen'}
      submitDisabled={!d.name.trim()}
      onClose={onClose}
      onSubmit={() => {
        const next = { ...d, name: d.name.trim(), ...birthdayFromDate(date, yearKnown) };
        if (id) update('people', id, next);
        else {
          const created = add('people', next);
          location.hash = `#/menschen/${created}`;
        }
        onClose();
      }}
    >
      <div className="form-grid">
        <label className="full">Name<input value={d.name} onChange={(e) => set('name', e.target.value)} placeholder="z. B. Lea Meier" autoFocus={!id} /></label>
        <label>Geburtstag<input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></label>
        <label className="check"><input type="checkbox" checked={!yearKnown} onChange={(e) => setYearKnown(!e.target.checked)} /> Jahr unbekannt</label>
        <label>Gruppe<input list="person-groups" value={d.group} onChange={(e) => set('group', e.target.value)} /></label>
        <datalist id="person-groups">{PERSON_GROUPS.map((g) => <option key={g} value={g} />)}</datalist>
        <label>Melde dich mal
          <select value={d.contactEvery} onChange={(e) => set('contactEvery', Number(e.target.value))}>
            {CONTACT_INTERVALS.map((c) => <option key={c.days} value={c.days}>{c.label}</option>)}
          </select>
        </label>
        <div className="full color-picker" role="radiogroup" aria-label="Farbe">
          {PERSON_COLORS.map((c) => (
            <button key={c} type="button" role="radio" aria-checked={d.color === c} aria-label={`Farbe ${c}`} className={`swatch ${d.color === c ? 'on' : ''}`} style={{ ['--c' as string]: c }} onClick={() => set('color', c)} />
          ))}
        </div>
      </div>
    </Sheet>
  );
}

function ContactButton({ person }: { person: Person }) {
  const { update } = useStore();
  return (
    <button type="button" className="small-pill" onClick={() => update('people', person.id, { lastContact: today() })} title="Heute gemeldet">
      Gemeldet
    </button>
  );
}

export function People() {
  const { data } = useStore();
  const t = today();
  const [adding, setAdding] = useState(false);
  const soon = upcomingBirthdays(data.people, t, 60);
  const due = data.people.map((p) => ({ p, since: contactDue(p, t) })).filter((x) => x.since !== null).sort((a, b) => (b.since ?? 0) - (a.since ?? 0));
  const groups = [...new Set(data.people.map((p) => p.group || 'Ohne Gruppe'))].sort((a, b) => a.localeCompare(b));
  return (
    <>
      <PageHeader title="Menschen" subtitle={soon[0] ? `Nächster Geburtstag: ${soon[0].person.name} ${daysLabel(soon[0].days)}` : 'Geburtstage, Geschenkideen und Kontakt halten'} actions={<AddButton label="Neuer Mensch" onClick={() => setAdding(true)} />} />
      <div className="grid-2">
        <Panel title="Bald Geburtstag">
          {soon.length === 0 ? <Empty>In den nächsten zwei Monaten hat niemand Geburtstag.</Empty> : (
            <ul className="list">
              {soon.map((b) => (
                <li key={b.person.id}>
                  {b.days <= 7 ? <CountdownRing person={b.person} days={b.days} /> : <span className="bday-ring"><Avatar person={b.person} size={34} /></span>}
                  <a className="grow" href={`#/menschen/${b.person.id}`}>
                    <div className="task-title">{b.person.name}</div>
                    <div className="meta">
                      <span>{parseDate(b.date).toLocaleDateString('de-DE', { weekday: 'long', day: 'numeric', month: 'short' })}</span>
                      {b.age && <span>wird {b.age}</span>}
                      {b.person.gifts.some((g) => !g.done) && <span>{b.person.gifts.filter((g) => !g.done).length} {b.person.gifts.filter((g) => !g.done).length === 1 ? 'Geschenkidee' : 'Geschenkideen'}</span>}
                    </div>
                  </a>
                  <strong className={b.days <= 7 ? 'bday-soon' : 'muted'}>{daysLabel(b.days)}</strong>
                </li>
              ))}
            </ul>
          )}
        </Panel>
        <div className="stack">
          {due.length > 0 && (
            <Panel title="Melde dich mal">
              <ul className="list">
                {due.map(({ p }) => (
                  <li key={p.id}>
                    <Avatar person={p} />
                    <a className="grow" href={`#/menschen/${p.id}`}>
                      <div className="task-title">{p.name}</div>
                      <div className="meta"><span>{p.lastContact ? `Zuletzt gemeldet ${sinceLabel(p.lastContact, t)}` : 'Noch kein Kontakt eingetragen'}</span></div>
                    </a>
                    <ContactButton person={p} />
                  </li>
                ))}
              </ul>
            </Panel>
          )}
          <Panel title={`Alle (${data.people.length})`}>
            {data.people.length === 0 ? <Empty>Noch niemand eingetragen. Tipp auf „+“ und trag Geburtstage von Familie und Freunden ein – AntonOS erinnert dich eine Woche vorher.</Empty> : groups.map((g) => (
              <div key={g} className="people-group">
                <h3>{g}</h3>
                <ul className="list dense">
                  {data.people.filter((p) => (p.group || 'Ohne Gruppe') === g).sort((a, b) => a.name.localeCompare(b.name)).map((p) => (
                    <li key={p.id}>
                      <Avatar person={p} size={28} />
                      <a className="grow" href={`#/menschen/${p.id}`}>{p.name}</a>
                      {p.birthday && <span className="muted small">{birthdayText(p)}</span>}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </Panel>
        </div>
      </div>
      {adding && <PersonSheet initial={blank(data.people.length)} onClose={() => setAdding(false)} />}
    </>
  );
}

export function PersonDetail({ id }: { id: ID }) {
  const { data, update, remove } = useStore();
  const t = today();
  const person = data.people.find((p) => p.id === id);
  const [editing, setEditing] = useState(false);
  const [gift, setGift] = useState('');
  const [meetDate, setMeetDate] = useState(t);
  const [meetNote, setMeetNote] = useState('');
  if (!person) return <Empty>Nicht gefunden. <a href="#/menschen">Zurück</a></Empty>;

  const next = nextBirthday(person, t);
  const days = next ? daysBetween(t, next) : null;
  const age = next ? ageOn(person, next) : null;
  const set = (patch: Partial<Person>) => update('people', id, patch);
  const openGifts = person.gifts.filter((g) => !g.done);
  const doneGifts = person.gifts.filter((g) => g.done);
  const meetings = [...person.meetings].sort((a, b) => b.date.localeCompare(a.date));
  const due = contactDue(person, t);

  return (
    <>
      <div className="person-hero" style={{ ['--c' as string]: person.color || '#8E8E93' }}>
        <a className="button" href="#/menschen">‹ Menschen</a>
        <Avatar person={person} size={76} />
        <h1>{person.name}</h1>
        <p>{[person.group, person.birthday && `Geburtstag ${birthdayText(person)}${person.birthYear ? ` ${person.birthYear}` : ''}`].filter(Boolean).join(' · ')}</p>
        {next && days !== null && <p className="person-countdown"><strong>{days === 0 ? 'Heute ist der Geburtstag!' : `Geburtstag ${daysLabel(days)}`}</strong>{age ? ` · wird ${age}` : ''}</p>}
        <div className="row">
          <button type="button" onClick={() => setEditing(true)}>Bearbeiten</button>
          <button type="button" className="danger" onClick={() => { if (confirm(`${person.name} löschen?`)) { remove('people', id); location.hash = '#/menschen'; } }}>Löschen</button>
        </div>
      </div>
      <div className="grid-2">
        <Panel title="Geschenkideen">
          <form
            className="inline-form"
            onSubmit={(e) => {
              e.preventDefault();
              if (!gift.trim()) return;
              set({ gifts: [...person.gifts, { id: newId(), title: gift.trim(), done: false, added: t }] });
              setGift('');
            }}
          >
            <input className="grow" value={gift} onChange={(e) => setGift(e.target.value)} placeholder="Idee merken, z. B. Kletterkurs" aria-label="Neue Geschenkidee" />
            <button type="submit" disabled={!gift.trim()}>Merken</button>
          </form>
          {openGifts.length === 0 && doneGifts.length === 0 ? <Empty>Noch keine Ideen. Merk sie dir das ganze Jahr über, sobald sie dir einfallen.</Empty> : (
            <ul className="list dense">
              {[...openGifts, ...doneGifts].map((g) => (
                <li key={g.id} className={g.done ? 'done' : ''}>
                  <button type="button" className="shop-check" role="checkbox" aria-checked={g.done} aria-label={`${g.title} verschenkt`} onClick={() => set({ gifts: person.gifts.map((x) => (x.id === g.id ? { ...x, done: !x.done } : x)) })} />
                  <span className="grow">{g.title}</span>
                  <span className="muted small">{g.done ? 'verschenkt' : `gemerkt ${sinceLabel(g.added, t)}`}</span>
                  <button type="button" className="icon" aria-label={`${g.title} löschen`} onClick={() => set({ gifts: person.gifts.filter((x) => x.id !== g.id) })}>×</button>
                </li>
              ))}
            </ul>
          )}
        </Panel>
        <div className="stack">
          <Panel title="Kontakt">
            <div className="row wrap">
              <span className="grow">{person.lastContact ? `Zuletzt gemeldet ${sinceLabel(person.lastContact, t)}` : 'Noch kein Kontakt eingetragen'}</span>
              <button type="button" className="primary" onClick={() => set({ lastContact: t })}>Heute gemeldet</button>
            </div>
            <label className="row wrap">Melde dich mal
              <select value={person.contactEvery} onChange={(e) => set({ contactEvery: Number(e.target.value) })}>
                {CONTACT_INTERVALS.map((c) => <option key={c.days} value={c.days}>{c.label}</option>)}
              </select>
            </label>
            {due !== null && <p className="small abo-warn">Zeit, dich mal wieder zu melden.</p>}
          </Panel>
          <Panel title="Treffen">
            <form
              className="inline-form"
              onSubmit={(e) => {
                e.preventDefault();
                if (!meetNote.trim()) return;
                const latest = !person.lastContact || meetDate > person.lastContact ? meetDate : person.lastContact;
                set({ meetings: [...person.meetings, { id: newId(), date: meetDate, note: meetNote.trim() }], lastContact: latest });
                setMeetNote('');
              }}
            >
              <input type="date" value={meetDate} onChange={(e) => e.target.value && setMeetDate(e.target.value)} aria-label="Datum" />
              <input className="grow" value={meetNote} onChange={(e) => setMeetNote(e.target.value)} placeholder="z. B. Kaffee in der Mensa" aria-label="Was habt ihr gemacht?" />
              <button type="submit" disabled={!meetNote.trim()}>Eintragen</button>
            </form>
            {meetings.length === 0 ? <Empty>Noch keine Treffen eingetragen.</Empty> : (
              <ul className="list dense">
                {meetings.slice(0, 12).map((m) => (
                  <li key={m.id}>
                    <span className="muted small meet-date">{formatDate(m.date)}</span>
                    <span className="grow">{m.note}</span>
                    <button type="button" className="icon" aria-label="Treffen löschen" onClick={() => set({ meetings: person.meetings.filter((x) => x.id !== m.id) })}>×</button>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
          <Panel title="Notiz">
            <textarea rows={3} value={person.note} onChange={(e) => set({ note: e.target.value })} placeholder="z. B. mag keinen Kuchen mit Nüssen" aria-label="Notiz" />
          </Panel>
        </div>
      </div>
      {editing && <PersonSheet initial={person} id={id} onClose={() => setEditing(false)} />}
    </>
  );
}

/** Dashboard-Widget: die nächsten Geburtstage */
export function BirthdaysWidget({ variant = 'standard' }: { variant?: WidgetVariant }) {
  const { data } = useStore();
  const t = today();
  const soon = upcomingBirthdays(data.people, t, variant === 'detail' ? 90 : 31).slice(0, variant === 'kompakt' ? 1 : variant === 'detail' ? 8 : 3);
  if (data.people.length === 0) return <Empty>Trag Geburtstage unter <a href="#/menschen">Menschen</a> ein.</Empty>;
  if (soon.length === 0) return <Empty>Kein Geburtstag im nächsten Monat.</Empty>;
  return (
    <ul className="list dense">
      {soon.map((b) => (
        <li key={b.person.id}>
          <Avatar person={b.person} size={28} />
          <a className="grow" href={`#/menschen/${b.person.id}`}>{b.person.name}{b.age ? <span className="muted small"> · wird {b.age}</span> : null}</a>
          <strong className={b.days <= 7 ? 'bday-soon' : 'muted'}>{daysLabel(b.days)}</strong>
        </li>
      ))}
    </ul>
  );
}
