import { useState } from 'react';
import { useStore } from '../store';
import type { Album } from '../types';
import { formatDate, today } from '../lib/dates';
import { Cover, ImageInput } from '../components/widgets';
import { Empty, PageHeader, Panel } from '../components/ui';

export function AlbumCard({ album }: { album: Album }) {
  const { remove } = useStore();
  return (
    <article className="gallery-card">
      <Cover src={album.cover} seed={album.id} emoji="📸" />
      <div className="gallery-body">
        <div className="row between">
          <strong>{album.title}</strong>
          <button className="icon" onClick={() => confirm(`„${album.title}“ löschen?`) && remove('albums', album.id)} aria-label="Löschen" title="Löschen">×</button>
        </div>
        <div className="meta">
          <span>{formatDate(album.date)}</span>
          {album.tags.split(',').map((t) => t.trim()).filter(Boolean).map((t) => <span key={t} className="tag">{t}</span>)}
        </div>
        {album.description && <p className="muted small">{album.description}</p>}
      </div>
    </article>
  );
}

export function Albums() {
  const { data, add } = useStore();
  const [title, setTitle] = useState('');
  const [date, setDate] = useState(today());
  const [cover, setCover] = useState('');
  const [tags, setTags] = useState('');
  const [description, setDescription] = useState('');

  return (
    <>
      <PageHeader title="Alben" subtitle="Erinnerungen an Reisen, Feiern und besondere Tage" />
      <Panel title="Neues Album">
        <form
          className="col"
          onSubmit={(e) => {
            e.preventDefault();
            if (!title.trim()) return;
            add('albums', { title: title.trim(), date, cover, tags, description: description.trim() });
            setTitle('');
            setCover('');
            setTags('');
            setDescription('');
          }}
        >
          <div className="inline-form">
            <input className="grow" placeholder="Titel, z. B. Silvester in Berlin" value={title} onChange={(e) => setTitle(e.target.value)} aria-label="Titel" />
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} aria-label="Datum" />
            <input placeholder="Tags, mit Komma getrennt" value={tags} onChange={(e) => setTags(e.target.value)} aria-label="Tags" />
          </div>
          <ImageInput value={cover} onChange={setCover} label="Titelbild" />
          <div className="inline-form">
            <input className="grow" placeholder="Beschreibung oder Link zum Fotoalbum" value={description} onChange={(e) => setDescription(e.target.value)} aria-label="Beschreibung" />
            <button className="primary" type="submit">Hinzufügen</button>
          </div>
        </form>
      </Panel>
      {data.albums.length === 0 ? <Empty>Noch keine Alben.</Empty> : (
        <div className="gallery">
          {[...data.albums].sort((a, b) => b.date.localeCompare(a.date)).map((a) => <AlbumCard key={a.id} album={a} />)}
        </div>
      )}
    </>
  );
}
