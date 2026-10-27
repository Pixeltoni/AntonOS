# AntonOS 🎓

Ein persönliches Studien- und Lebens-Betriebssystem im Browser, inspiriert von Notion-Templates wie *Academia OS* und *Life Planner OS*, aber als eigene Web-App.

## Funktionen

- **Dashboard:** Titelbild, Uhr, Tages-/Wochen-/Monats-/Jahresfortschritt, Schnellaktionen, Aufgaben der Woche, aktive Projekte, letzte Buchungen, „Gerade am Schauen/Lesen“, Gewohnheiten heute, letzte Trainings, Lieblingsmusik (Spotify), nützliche Tools, Monatskalender, Alben und Vision Board

- **Anpassbar:** Über *Dashboard bearbeiten* lassen sich Kästen verschieben, in Breite (¼ bis ganze Breite) und Höhe anpassen, zwischen den Ansichten Kompakt, Standard und Detail umschalten oder ausblenden. Das Raster ordnet sich auf Tablet und Handy automatisch um. Hintergrund (Farbe, Verlauf, eigenes Bild), Abdunkeln, durchsichtige Kästen, Hell/Dunkel und Akzentfarbe sind frei wählbar. Über *Sidebar bearbeiten* (ganz unten in der Sidebar) lassen sich Einträge umbenennen, mit anderem Symbol versehen, umsortieren, in Gruppen einordnen oder ausblenden.
- **Musik:** Spotify-Fenster mit Anmeldung über dein eigenes Konto. Es zeigt, was gerade läuft, steuert die Wiedergabe (Play/Pause, vor/zurück, Lautstärke), spielt deine Playlists und kann direkt im Browser abspielen. Die Steuerung erfordert Spotify Premium; ohne Premium bleibt die eingebettete Playlist. Ein Mini-Player bleibt auf allen Seiten sichtbar.

### Studium

- **Kurse:** mit Kürzel, Semester, Dozent/in, Raum, ECTS und Farbe. Jede Kursseite bündelt Aufgaben, Prüfungen, Lernkarten, Noten und Notizen.
- **Aufgaben:** Aufgaben, Lektüre, Projekte und Bewerbungen mit Status, Priorität und Fälligkeit, filterbar
- **Notizen:** pro Kurs, mit Suche und automatischem Speichern
- **Lernkarten:** Wiederholung nach dem Prinzip der verteilten Wiederholung (vereinfachter SM-2-Algorithmus wie bei Anki), bedienbar per Tastatur (Leertaste, 1–4)
- **Prüfungen:** mit Countdown
- **Noten:** deutsches Notensystem (1,0–5,0). Teilnoten werden pro Kurs gewichtet, der Gesamtschnitt nach ECTS. Wie in vielen Prüfungsordnungen wird nach der ersten Nachkommastelle abgeschnitten.
- **Fokus:** Timer mit Ablenkungszähler und Wochenübersicht

### Leben
- **Kalender:** Monatsansicht mit Aufgaben, Prüfungen, Projekt-Deadlines und Trainings
- **Projekte:** mit Titelbild, Status und eigenen Aufgaben; der Fortschritt ergibt sich aus den erledigten Aufgaben
- **Gewohnheiten:** tägliches Abhaken, Wochenraster, Serien 🔥 und 30-Tage-Quote
- **Ziele:** Vision Board nach Lebensbereichen mit Inspirationsbildern und Fortschritt
- **Finanzen:** Einnahmen und Ausgaben pro Monat, Saldo und Ausgaben nach Kategorie
- **Training:** geplante und erledigte Workouts

### Sammlungen
- **Watchlist & Leseliste:** Serien, Filme, Bücher und Hörbücher mit Cover, Status, Fortschritt und Sternebewertung
- **Alben:** Erinnerungen mit Titelbild und Tags
- **Tools:** deine wichtigsten Links nach Kategorie

### Spotify verbinden
1. Im [Spotify Developer Dashboard](https://developer.spotify.com/dashboard) eine App anlegen.
2. Als Redirect URI die Adresse von AntonOS eintragen, z. B. `https://pixeltoni.github.io/AntonOS/` (lokal: `http://127.0.0.1:5173/`).
3. „Web API“ und „Web Playback SDK“ auswählen, speichern und die Client ID unter *Musik* in AntonOS einfügen.

Der Login läuft über PKCE direkt zwischen Browser und Spotify. Das Token bleibt im Browser und landet nicht im Backup.

### Einstellungen
- Name, Titelbild und Spotify-Playlist fürs Dashboard
- Backup als JSON exportieren und importieren, Beispieldaten laden, alles zurücksetzen

Bilder lassen sich per Link einfügen oder hochladen; hochgeladene Bilder werden verkleinert, damit der Browser-Speicher reicht.

Ohne Anmeldung bleiben alle Daten lokal im Browser (`localStorage`).

### Synchronisierung (Supabase)
Unter *Einstellungen → Synchronisierung* meldest du dich mit E-Mail und Passwort an. Danach werden deine Daten automatisch gespeichert und auf allen Geräten abgeglichen; offline arbeitest du normal weiter. Wurde auf zwei Geräten gleichzeitig etwas geändert, fragt AntonOS, welche Version gelten soll.

- Die Daten liegen in der Tabelle `user_data` (ein Datensatz pro Konto). Row Level Security sorgt dafür, dass jedes Konto ausschließlich seine eigenen Daten lesen und ändern kann; ohne Anmeldung ist nichts lesbar.
- Adresse und Publishable Key des Projekts stehen bewusst im Code (`src/lib/cloud.ts`) – sie sind öffentlich und geben ohne Login keinen Zugriff.
- Der Workflow `keepalive.yml` ruft alle zwei Tage `keepalive()` auf, damit das kostenlose Projekt nicht wegen Inaktivität pausiert.

## Online nutzen

Die App wird bei jedem Push auf `Main` automatisch gebaut und auf GitHub Pages veröffentlicht:
https://pixeltoni.github.io/AntonOS/

Einmalig nötig: unter *Settings → Pages → Build and deployment → Source* „GitHub Actions“ auswählen.

## Loslegen

```bash
npm install
npm run dev        # Entwicklungsserver auf http://localhost:5173
npm test           # Tests für Spaced Repetition, Noten und Datumslogik
npm run build      # Produktions-Build nach dist/
```

Beim ersten Start werden Beispieldaten geladen. Unter *Einstellungen → Alles löschen* startest du mit einem leeren System.

## Aufbau

```
src/
  types.ts          Datenmodell
  store.tsx         Zustand + Speicherung im Browser
  demo.ts           Beispieldaten
  lib/              reine Logik (Daten, Spaced Repetition, Noten) + Tests
  components/       wiederverwendbare UI-Bausteine
  pages/            eine Datei pro Bereich
```

Technik: React 19, TypeScript, Vite, Vitest.
