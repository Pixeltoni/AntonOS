import { useRef, useState } from 'react';
import { emptyData, normalize, useStore } from '../store';
import { demoData } from '../demo';
import { today } from '../lib/dates';
import { spotifyEmbedUrl } from '../lib/life';
import { ImageInput } from '../components/widgets';
import { AppearanceEditor } from '../components/appearance';
import { PageHeader, Panel } from '../components/ui';

export function Settings() {
  const { data, replaceAll, updateSettings } = useStore();
  const spotify = data.settings.spotifyUrl;
  const file = useRef<HTMLInputElement>(null);
  const [message, setMessage] = useState('');

  const exportData = () => {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `antonos-backup-${today()}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const importData = async (f: File) => {
    try {
      replaceAll(normalize(JSON.parse(await f.text())));
      setMessage('Import erfolgreich.');
    } catch {
      setMessage('Die Datei konnte nicht gelesen werden.');
    }
  };

  return (
    <>
      <PageHeader title="Einstellungen" />
      <Panel title="Dashboard">
        <div className="form-grid">
          <label>Dein Name<input value={data.settings.name} onChange={(e) => updateSettings({ name: e.target.value })} /></label>
          <label className="full">Titelbild<ImageInput value={data.settings.cover} onChange={(cover) => updateSettings({ cover })} /></label>
          <label className="full">
            Spotify-Link (Playlist, Album oder Song)
            <input
              placeholder="https://open.spotify.com/playlist/…"
              value={spotify}
              onChange={(e) => updateSettings({ spotifyUrl: e.target.value })}
            />
            {spotify && !spotifyEmbedUrl(spotify) && <span className="danger small">Das ist kein gültiger Spotify-Link.</span>}
          </label>
        </div>
      </Panel>
      <Panel title="🎨 Hintergrund & Design">
        <AppearanceEditor />
      </Panel>
      <Panel title="Daten">
        <p className="muted">
          Alle Daten werden nur lokal in diesem Browser gespeichert. Mach ab und zu ein Backup – besonders bevor du den
          Browser-Speicher löschst oder das Gerät wechselst.
        </p>
        <div className="row wrap">
          <button className="primary" onClick={exportData}>Backup herunterladen</button>
          <button onClick={() => file.current?.click()}>Backup einspielen</button>
          <input
            ref={file}
            type="file"
            accept="application/json"
            hidden
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f && confirm('Alle aktuellen Daten durch das Backup ersetzen?')) importData(f);
              e.target.value = '';
            }}
          />
        </div>
        {message && <p>{message}</p>}
      </Panel>
      <Panel title="Zurücksetzen">
        <div className="row wrap">
          <button onClick={() => confirm('Aktuelle Daten durch Beispieldaten ersetzen?') && replaceAll(demoData())}>
            Beispieldaten laden
          </button>
          <button className="danger" onClick={() => confirm('Wirklich ALLE Daten löschen?') && replaceAll(emptyData())}>
            Alles löschen
          </button>
        </div>
      </Panel>
    </>
  );
}
