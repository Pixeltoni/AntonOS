import { useState } from 'react';
import { useStore } from '../store';
import { spotifyEmbedUrl } from '../lib/life';
import { SpotifyPlayer, useSpotify } from '../components/spotify';
import { PageHeader, Panel } from '../components/ui';

export function Music() {
  const { data, updateSettings } = useStore();
  const s = useSpotify();
  const [embed, setEmbed] = useState(data.settings.spotifyUrl);

  return (
    <>
      <PageHeader title="Musik" subtitle="Dein Spotify direkt in AntonOS" />
      <Panel title="🎵 Spotify">
        <SpotifyPlayer />
      </Panel>
      <Panel title="Einstellungen">
        <div className="form-grid">
          <label className="full">
            Playlist zum Einbetten (funktioniert auch ohne Verbindung)
            <div className="row">
              <input className="grow" placeholder="https://open.spotify.com/playlist/…" value={embed} onChange={(e) => setEmbed(e.target.value)} />
              <button onClick={() => updateSettings({ spotifyUrl: embed.trim() })} disabled={!!embed.trim() && !spotifyEmbedUrl(embed)}>Speichern</button>
            </div>
            {embed && !spotifyEmbedUrl(embed) && <span className="danger small">Das ist kein gültiger Spotify-Link.</span>}
          </label>
        </div>
        {s.clientId && (
          <div className="row wrap">
            <span className="muted small">Client ID: {s.clientId.slice(0, 6)}…</span>
            <button
              onClick={() => {
                if (confirm('Client ID entfernen und Spotify trennen?')) {
                  s.disconnect();
                  updateSettings({ spotifyClientId: '' });
                }
              }}
            >
              Spotify-App ändern
            </button>
          </div>
        )}
      </Panel>
    </>
  );
}
