# AntonOS 🎓

Ein persönliches Studien- und Lebens-Betriebssystem im Browser, inspiriert von Notion-Templates wie *Academia OS* und *Life Planner OS*, aber als eigene Web-App.

## Funktionen

- **Dashboard:** Titelbild, Uhr, Tages-/Wochen-/Monats-/Jahresfortschritt, Schnellaktionen, Aufgaben der Woche, aktive Projekte, letzte Buchungen, „Gerade am Schauen/Lesen“, Gewohnheiten heute, letzte Trainings, Lieblingsmusik (Spotify), nützliche Tools, Monatskalender, Alben und Vision Board

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

### Einstellungen
- Name, Titelbild und Spotify-Playlist fürs Dashboard
- Backup als JSON exportieren und importieren, Beispieldaten laden, alles zurücksetzen

Bilder lassen sich per Link einfügen oder hochladen; hochgeladene Bilder werden verkleinert, damit der Browser-Speicher reicht.

Alle Daten bleiben lokal im Browser (`localStorage`). Es gibt keinen Server und kein Konto.

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
