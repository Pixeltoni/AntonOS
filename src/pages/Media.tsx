import { useState } from 'react';
import { useStore } from '../store';
import type { Media as MediaItem, MediaKind, MediaStatus } from '../types';
import { Cover, ImageInput, Stars } from '../components/widgets';
import { Empty, PageHeader, Panel } from '../components/ui';

const STATUSES: MediaStatus[] = ['geplant', 'läuft', 'fertig', 'abgebrochen'];
export const WATCH_KINDS: MediaKind[] = ['Serie', 'Film'];
export const READ_KINDS: MediaKind[] = ['Buch', 'Hörbuch'];
const EMOJI: Record<MediaKind, string> = { Serie: '📺', Film: '🎬', Buch: '📖', Hörbuch: '🎧' };

export function MediaCard({ item, compact = false }: { item: MediaItem; compact?: boolean }) {
  const { update, remove } = useStore();
  return (
    <article className="gallery-card">
      <Cover src={item.cover} seed={item.id} emoji={EMOJI[item.kind]} className="poster" />
      <div className="gallery-body">
        <strong>{item.title}</strong>
        <div className="meta">
          <span className="tag">{item.kind}</span>
          {item.creator && <span>{item.creator}</span>}
          {item.progress && <span>{item.progress}</span>}
        </div>
        <Stars value={item.rating} onChange={(rating) => update('media', item.id, { rating })} />
        {!compact && (
          <div className="row between">
            <select value={item.status} onChange={(e) => update('media', item.id, { status: e.target.value as MediaStatus })} aria-label="Status">
              {STATUSES.map((s) => <option key={s}>{s}</option>)}
            </select>
            <input
              className="grow"
              placeholder={item.kind === 'Serie' ? 'z. B. S2 E5' : item.kind === 'Film' ? 'Notiz' : 'z. B. S. 120'}
              value={item.progress}
              onChange={(e) => update('media', item.id, { progress: e.target.value })}
              aria-label="Fortschritt"
            />
            <button className="icon" onClick={() => remove('media', item.id)} aria-label="Löschen" title="Löschen">×</button>
          </div>
        )}
      </div>
    </article>
  );
}

export function MediaPage({ mode }: { mode: 'schauen' | 'lesen' }) {
  const { data, add } = useStore();
  const kinds = mode === 'schauen' ? WATCH_KINDS : READ_KINDS;
  const [kind, setKind] = useState<MediaKind>(kinds[0]);
  const [title, setTitle] = useState('');
  const [creator, setCreator] = useState('');
  const [cover, setCover] = useState('');
  const [filter, setFilter] = useState<MediaStatus | ''>('');

  const items = data.media.filter((m) => kinds.includes(m.kind) && (!filter || m.status === filter));
  const groups = STATUSES.map((s) => ({ status: s, items: items.filter((m) => m.status === s) })).filter((g) => g.items.length);

  return (
    <>
      <PageHeader
        title={mode === 'schauen' ? 'Watchlist' : 'Leseliste'}
        subtitle={mode === 'schauen' ? 'Serien und Filme' : 'Bücher und Hörbücher'}
        actions={
          <select value={filter} onChange={(e) => setFilter(e.target.value as MediaStatus | '')} aria-label="Status filtern">
            <option value="">Alle</option>
            {STATUSES.map((s) => <option key={s}>{s}</option>)}
          </select>
        }
      />
      <Panel title="Hinzufügen">
        <form
          className="col"
          onSubmit={(e) => {
            e.preventDefault();
            if (!title.trim()) return;
            add('media', { kind, title: title.trim(), creator: creator.trim(), cover, status: 'geplant', rating: 0, progress: '' });
            setTitle('');
            setCreator('');
            setCover('');
          }}
        >
          <div className="inline-form">
            <select value={kind} onChange={(e) => setKind(e.target.value as MediaKind)} aria-label="Art">
              {kinds.map((k) => <option key={k}>{k}</option>)}
            </select>
            <input className="grow" placeholder="Titel" value={title} onChange={(e) => setTitle(e.target.value)} aria-label="Titel" />
            <input placeholder={mode === 'schauen' ? 'Plattform, z. B. Netflix' : 'Autor/in'} value={creator} onChange={(e) => setCreator(e.target.value)} aria-label="Plattform oder Autor" />
          </div>
          <div className="inline-form">
            <div className="grow"><ImageInput value={cover} onChange={setCover} label="Cover" /></div>
            <button className="primary" type="submit">Hinzufügen</button>
          </div>
        </form>
      </Panel>
      {groups.length === 0 && <Empty>Noch nichts eingetragen.</Empty>}
      {groups.map((g) => (
        <Panel key={g.status} title={`${g.status[0].toUpperCase()}${g.status.slice(1)} (${g.items.length})`}>
          <div className="gallery posters">{g.items.map((m) => <MediaCard key={m.id} item={m} />)}</div>
        </Panel>
      ))}
    </>
  );
}
