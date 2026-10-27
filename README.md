# AntonOS 🎓

Ein persönliches Studien- und Lebens-Betriebssystem im Browser, inspiriert von Notion-Templates wie *Academia OS* und *Life Planner OS*, aber als eigene Web-App.

## Funktionen

- **Dashboard:** Titelbild, Uhr, Tages-/Wochen-/Monats-/Jahresfortschritt, Schnellaktionen, Aufgaben der Woche, aktive Projekte, letzte Buchungen, „Gerade am Schauen/Lesen“, Gewohnheiten heute, letzte Trainings, Lieblingsmusik (Spotify), nützliche Tools, Monatskalender, Alben und Vision Board. Dazu Widgets im iOS-Stil: Smart Stack zum Durchwischen (ordnet sich nach Tageszeit), Heute, Prüfungs-Countdown, Aktivitätsringe, Fokus-Timer und Budget

- **Anpassbar:** Über *Dashboard bearbeiten* lassen sich Kästen per Ziehen am Griff ⠿ anordnen, über die Widget-Galerie mit Vorschau hinzufügen, in Breite (¼ bis ganze Breite) und Höhe anpassen, zwischen den Ansichten Kompakt, Standard und Detail umschalten oder ausblenden. Das Raster ordnet sich auf Tablet und Handy automatisch um. Hintergrund (Farbe, Verlauf, eigenes Bild), Abdunkeln, Milchglas-Kästen wie bei iOS (Milchigkeit einstellbar), Hell/Dunkel und Akzentfarbe sind frei wählbar. Am PC ist die Sidebar eine schmale Symbolleiste, die beim Darüberfahren mit der Maus aufklappt. Über *Sidebar bearbeiten* (ganz unten in der Sidebar) lassen sich Einträge umbenennen, mit anderem Symbol versehen, umsortieren, in Gruppen einordnen oder ausblenden.
- **Musik:** Spotify-Fenster mit Anmeldung über dein eigenes Konto. Es zeigt, was gerade läuft, steuert die Wiedergabe (Play/Pause, vor/zurück, Lautstärke), spielt deine Playlists und kann direkt im Browser abspielen. Die Steuerung erfordert Spotify Premium; ohne Premium bleibt die eingebettete Playlist. Ein Mini-Player bleibt auf allen Seiten sichtbar.

### Studium

- **Kurse:** mit Kürzel, Semester, Dozent/in, Raum, ECTS und Farbe. Jede Kursseite bündelt Aufgaben, Prüfungen, Lernkarten, Noten und Notizen.
- **Aufgaben:** im Stil von Apple Erinnerungen – Listen-Kacheln (Heute, Geplant, Alle, Markiert, Erledigt), Kurse als eigene Listen, runde Häkchen mit „Widerrufen“, Markieren, Unteraufgaben, Notiz und Uhrzeit. Schnelleingabe in natürlicher Sprache: „Übungsblatt morgen 10 Uhr !!! #analysis“ (! niedrig, !! mittel, !!! hoch, #Kurs).
- **Notizen:** pro Kurs, mit Suche und automatischem Speichern
- **Lernkarten:** Wiederholung nach dem Prinzip der verteilten Wiederholung (vereinfachter SM-2-Algorithmus wie bei Anki), bedienbar per Tastatur (Leertaste, 1–4)
- **Prüfungen:** mit Countdown
- **Noten:** deutsches Notensystem (1,0–5,0). Teilnoten werden pro Kurs gewichtet, der Gesamtschnitt nach ECTS. Wie in vielen Prüfungsordnungen wird nach der ersten Nachkommastelle abgeschnitten.
- **Fokus:** Fokus-Modi (Lernen, Arbeiten, Lesen) mit großem Ring-Timer, Pomodoro-Runden und automatischen Pausen. Der Timer läuft auf allen Seiten als schwebende Live-Aktivität weiter (auch nach dem Neuladen), blendet im Fokus unpassende Dashboard-Kästen aus und zeigt die Woche als gestapelte Balken pro Kurs. Lernzeit fließt in den Lernen-Ring und auf die Kursseite

### Leben
- **Kalender:** Tages-, Wochen- und Monatsansicht; auf dem Handy und in schmalen Kästen im Stil des iPhone-Kalenders (Mini-Monat mit Punkten und Tagesliste, Wochenleiste, Zeitleiste mit Jetzt-Linie). Eigene Termine mit Name, Notiz, Datum (optional über mehrere Tage), optionaler Uhrzeit und Wichtigkeit (niedrig/mittel/hoch); dazu Aufgaben, Prüfungen, Projekt-Deadlines und Trainings
- **Projekte:** mit Titelbild, Status und eigenen Aufgaben; der Fortschritt ergibt sich aus den erledigten Aufgaben
- **Gewohnheiten:** Aktivitätsringe wie bei Apple Fitness – Lernen (aus dem Fokus-Timer), Bewegung (aus dem Training) und Gewohnheiten – mit einstellbaren Tageszielen, Wochenleiste, Auszeichnungen und Erinnerung am Abend. Dazu Mengen-Gewohnheiten (z. B. „+ 0,25 l“), Wochenraster, Serien 🔥 und 30-Tage-Quote
- **Ziele:** Vision Board nach Lebensbereichen mit Inspirationsbildern und Fortschritt
- **Finanzen:** im Stil von Apple Wallet – Budget-Karte mit „Verfügbar“, Ausgaben als Kategorien-Ring, Buchungen mit Kategoriesymbolen. Monatsbudget und Budgets pro Kategorie mit Warnung ab 90 %, Daueraufträge (Miete, Abos, Gehalt) werden jeden Monat automatisch gebucht, Spartöpfe mit Ziel und CSV-Export für Excel
- **Training:** geplante und erledigte Workouts mit Dauer (zählt für den Bewegungsring)

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
