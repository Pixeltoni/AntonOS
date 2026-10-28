import { useState } from 'react';
import { useStore } from '../store';
import type { Album } from '../types';
import { parseDate, today } from '../lib/dates';
import { safeHttpUrl } from '../lib/life';
import { Cover, ImageInput } from '../components/widgets';
import { Empty, PageHeader } from '../components/ui';
import { AddButton, Sheet } from '../components/sheet';

/** Album-Kachel wie in Fotos: Titelbild mit Titel und Datum darüber */
export function AlbumCard({ album, onOpen }: { album: Album; onOpen?: (a: Album) => void }) {
  const link = /^https?:\/\//.test(album.description.trim()) ? safeHttpUrl(album.description.trim()) : null;
  const inner = (
    <>
      <Cover src={album.cover} seed={album.id} emoji="📸" className="album-cover" />
      <span className="album-shade" aria-hidden />
      <span className="album-text">
        <strong>{album.title}</strong>
        <small>{parseDate(album.date).toLocaleDateString('de-DE', { day: 'numeric', month: 'long', year: 'numeric' })}</small>
      </span>
    </>
  );
  return (
    <article className="album-tile">
      {onOpen ? (
        <button type="button" className="album-main" onClick={() => onOpen(album)} aria-label={`${album.title} bearbeiten`}>{inner}</button>
      ) : (
        <a className="album-main" href="#/alben">{inner}</a>
      )}
      <div className="album-meta">
        {album.tags.split(',').map((t) => t.trim()).filter(Boolean).map((t) => <span key={t} className="tag">{t}</span>)}
        {link && <a className="small" href={link} target="_blank" rel="noopener noreferrer">Fotos öffnen ↗</a>}
      </div>
    </article>
  );
}

type Draft = Omit<Album, 'id'>;

function AlbumSheet({ initial, id, onClose }: { initial: Draft; id?: string; onClose: () => void }) {
  const { add, update, remove } = useStore();
  const [a, setA] = useState<Draft>(initial);
  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setA((x) => ({ ...x, [k]: v }));
  return (
    <Sheet
      title={id ? 'Album bearbeiten' : 'Neues Album'}
      submitLabel={id ? 'Sichern' : 'Hinzufügen'}
      onClose={onClose}
      submitDisabled={!a.title.trim()}
      onSubmit={() => {
        const final = { ...a, title: a.title.trim(), description: a.description.trim() };
        if (id) update('albums', id, final);
        else add('albums', final);
        onClose();
      }}
    >
      <label>Titel<input autoFocus value={a.title} placeholder="z. B. Silvester in Berlin" onChange={(e) => set('title', e.target.value)} /></label>
      <div className="modal-grid">
        <label>Datum<input type="date" value={a.date} onChange={(e) => set('date', e.target.value)} /></label>
        <label>Tags<input value={a.tags} placeholder="mit Komma getrennt" onChange={(e) => set('tags', e.target.value)} /></label>
      </div>
      <ImageInput value={a.cover} onChange={(cover) => set('cover', cover)} label="Titelbild" />
      <label>Link zum Fotoalbum oder Beschreibung<input value={a.description} placeholder="z. B. Link zu iCloud-Fotos oder Google Fotos" onChange={(e) => set('description', e.target.value)} /></label>
      {id && <button type="button" className="danger" onClick={() => { if (confirm('Album löschen?')) { remove('albums', id); onClose(); } }}>Album löschen</button>}
    </Sheet>
  );
}

export function Albums() {
  const { data } = useStore();
  const [sheet, setSheet] = useState<{ initial: Draft; id?: string } | null>(null);
  const sorted = [...data.albums].sort((a, b) => b.date.localeCompare(a.date));
  const years = [...new Set(sorted.map((a) => a.date.slice(0, 4)))];

  return (
    <>
      <PageHeader
        title="Alben"
        subtitle={`${data.albums.length} ${data.albums.length === 1 ? 'Erinnerung' : 'Erinnerungen'}`}
        actions={<AddButton label="Neues Album" onClick={() => setSheet({ initial: { title: '', date: today(), cover: '', tags: '', description: '' } })} />}
      />
      {sorted.length === 0 ? <Empty>Noch keine Alben. Tippe auf +, um deine erste Erinnerung anzulegen.</Empty> : (
        years.map((y) => (
          <section key={y} className="album-year">
            <h2>{y}</h2>
            <div className="album-grid">
              {sorted.filter((a) => a.date.startsWith(y)).map((a) => <AlbumCard key={a.id} album={a} onOpen={(x) => setSheet({ initial: { ...x }, id: x.id })} />)}
            </div>
          </section>
        ))
      )}
      {sheet && <AlbumSheet initial={sheet.initial} id={sheet.id} onClose={() => setSheet(null)} />}
    </>
  );
}
