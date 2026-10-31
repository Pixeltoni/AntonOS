# AntonOS

Dein persönlicher Life-Organizer im Browser und als App: Kalender, Aufgaben, Notizen, Gewohnheiten, Ziele, Finanzen, Einkauf, Training, Studium und Freizeit an einem Ort – im Stil von Apple. Ursprünglich inspiriert von Notion-Templates wie *Academia OS* und *Life Planner OS*.

Die Sidebar ist nach Lebensbereichen geordnet (Start, Leben, Geld, Studium, Freizeit) und nutzt einheitliche Linien-Symbole; das App-Symbol ist ein kursives „A“.

## Funktionen

- **Dashboard:** Titelbild, Uhr, Tages-/Wochen-/Monats-/Jahresfortschritt, Schnellaktionen, Aufgaben der Woche, aktive Projekte, letzte Buchungen, „Gerade am Schauen/Lesen“, Gewohnheiten heute, letzte Trainings, Lieblingsmusik (Spotify), nützliche Tools, Monatskalender, Alben und Vision Board. Dazu Widgets im iOS-Stil: Smart Stack zum Durchwischen (ordnet sich nach Tageszeit), Heute, Prüfungs-Countdown, Aktivitätsringe, Fokus-Timer und Budget; in der Widget-Galerie außerdem „Essen heute“, „Geburtstage“ und „Nächste Reise“

- **Als App:** installierbar auf iPhone, Android und PC (Safari: Teilen → „Zum Home-Bildschirm“) – eigenes Symbol mit Zahl der heute fälligen Aufgaben, Start ohne Browser-Leisten, funktioniert offline (Service Worker), Mitteilungen für Termine, Vorlesungen, Ringe, Fokus-Timer, Geburtstage, Kündigungsfristen und Reisen, Kurzbefehle am Symbol und Teilen-Menü (Android/Chrome) für Links in Notizen, Aufgaben, Rezepte, Watchlist, Leseliste oder Tools. Anleitung unter Einstellungen → „Als App auf dem Handy“
- **Spotlight-Suche:** ⌘K / Strg+K oder „/“ (auf dem Handy 🔍 oben) durchsucht alles – Aufgaben, Notizen (auch im Text), Lernkarten, Termine, Prüfungen, Kurse, Projekte, Ziele, Einkaufsliste, Medien, Buchungen und Seiten. Direkt-Aktionen: Aufgabe anlegen (mit Datum/Priorität wie in der Schnelleingabe), „4,50 Mensa“ als Ausgabe buchen, Notiz anlegen, auf die Einkaufsliste setzen, Fokus für einen Kurs starten. Rechnet auch („19% * 250“)
- **Assistentin:** ⌘J / Strg+J, 🪄 in der Sidebar bzw. auf dem Handy oben – versteht ganze Sätze, getippt oder gesprochen (🎤, Deutsch): „Erinnere mich morgen um 8, dass ich den Müll mitnehme“ (Aufgabe mit Mitteilung zur Uhrzeit), „Füge Bananen und zwei Gurken zu meiner Einkaufsliste hinzu“, „Termin Zahnarzt Freitag 10 Uhr“, „12 € für Pizza ausgegeben“, „Ich habe meditiert“, „Notiz: …“. Versteht auch „halb neun“, „8 Uhr abends“ und „in 20 Minuten“. Danach zeigt ein kleines Popup, was eingetragen wurde – direkt änderbar oder mit „Widerrufen“ rückgängig. Läuft komplett ohne Internet und ohne KI (Spracherkennung je nach Browser online)
- **Anpassbar:** Über *Dashboard bearbeiten* lassen sich Kästen per Ziehen am Griff ⠿ anordnen, über die Widget-Galerie mit Vorschau hinzufügen, in Breite (¼ bis ganze Breite) und Höhe anpassen, zwischen den Ansichten Kompakt, Standard und Detail umschalten oder ausblenden. Das Raster ordnet sich auf Tablet und Handy automatisch um. Das Design nutzt helle, ruhige Weißtöne im Notion-Stil; Hell/Dunkel ist wählbar. Am PC ist die Sidebar eine schmale Symbolleiste, die beim Darüberfahren mit der Maus aufklappt. Über *Sidebar bearbeiten* (ganz unten in der Sidebar) lassen sich Einträge umbenennen, mit anderem Symbol versehen, umsortieren, in Gruppen einordnen oder ausblenden.
- **Musik:** Spotify-Fenster mit Anmeldung über dein eigenes Konto. Es zeigt, was gerade läuft, steuert die Wiedergabe (Play/Pause, vor/zurück, Lautstärke), spielt deine Playlists und kann direkt im Browser abspielen. Die Steuerung erfordert Spotify Premium; ohne Premium bleibt die eingebettete Playlist. Ein Mini-Player bleibt auf allen Seiten sichtbar.

### Studium

- **Kurse:** mit Kürzel, Semester, Dozent/in, Raum, ECTS und Farbe. Jede Kursseite bündelt Aufgaben, Prüfungen, Lernkarten, Noten und Notizen.
- **Aufgaben:** im Stil von Apple Erinnerungen – Listen-Kacheln (Heute mit „🌙 Heute Abend“, Geplant, Alle, Markiert, Irgendwann, Logbuch nach Tagen), Kurse und Projekte (mit Fortschritts-Kuchen) als eigene Listen, „Wann?“ wie in Things (Heute, Abends, Irgendwann – auch per Text „heute abend“ / „irgendwann“), runde Häkchen mit „Widerrufen“, Markieren, Unteraufgaben, Notiz und Uhrzeit. Schnelleingabe in natürlicher Sprache: „Übungsblatt morgen 10 Uhr !!! #analysis“ (! niedrig, !! mittel, !!! hoch, #Kurs).
- **Notizen:** wie Apple Notizen – Ordner pro Kurs, angeheftete Notizen, #Tags, Suche und nach Datum gruppierte Liste. Checklisten zum Abhaken, Überschriften, **fett**, [[Verknüpfungen]] zu Notizen, Aufgaben und Kursen; Kürzel ⌘B, ⇧⌘L (Checkliste), ⇧⌘H (Überschrift). Zeilen wie „Begriff: Erklärung“ werden mit 🧠 zu Lernkarten
- **Lernkarten:** Stapel pro Kurs mit fällig/neu/lerne ich/sitzt, Lernen mit umdrehbarer Karte und Vorschau des nächsten Abstands je Bewertung (Spaced Repetition, SM-2), Suche, neue Karten über „+“
- **Prüfungen:** Countdown-Karten in Kursfarbe mit fälligen Lernkarten und offenen Aufgaben des Kurses, vergangene Prüfungen eingeklappt
- **Noten:** deutsches Notensystem (1,0–5,0). Teilnoten werden pro Kurs gewichtet, der Gesamtschnitt nach ECTS. Wie in vielen Prüfungsordnungen wird nach der ersten Nachkommastelle abgeschnitten. – Übersicht im Health-Stil mit ECTS-Ring, Schnellauswahl der Noten und verständlichen Fehlermeldungen
- **Fokus:** Fokus-Modi (Lernen, Arbeiten, Lesen) mit großem Ring-Timer, Pomodoro-Runden und automatischen Pausen. Der Timer läuft auf allen Seiten als schwebende Live-Aktivität weiter (auch nach dem Neuladen), blendet im Fokus unpassende Dashboard-Kästen aus und zeigt die Woche als gestapelte Balken pro Kurs. Lernzeit fließt in den Lernen-Ring und auf die Kursseite

### Leben
- **Kalender:** Tages-, Wochen- und Monatsansicht; auf dem Handy und in schmalen Kästen im Stil des iPhone-Kalenders (Mini-Monat mit Punkten und Tagesliste, Wochenleiste, Zeitleiste mit Jetzt-Linie). Eigene Termine mit Name, Notiz, Datum (optional über mehrere Tage), optionaler Uhrzeit und Wichtigkeit (niedrig/mittel/hoch); dazu Aufgaben, Prüfungen, Projekt-Deadlines und Trainings. Termine können sich wiederholen (täglich, wöchentlich, alle 2 Wochen, monatlich, jährlich, mit Enddatum und einzelnen Ausnahmen), einzeln oder als ganze Serie geändert werden und vorher erinnern. Wochenansicht als Zeitraster, mehrtägige Termine als durchgehende Balken, eigene Farbe und Ort pro Termin, Duplizieren, Filter nach Art (Termine, Vorlesungen, Aufgaben …), Schnelleingabe („Lerngruppe morgen 14-16 Uhr @Bibliothek“, „Chor jeden Mittwoch 19 Uhr“), Termine per Ziehen verschieben und verlängern (am Handy kurz gedrückt halten), Wischen bzw. Pfeiltasten zum Blättern (T = heute, N = neu, D/W/M = Ansicht) und Import/Export als .ics.
- **Stundenplan:** Kurszeiten (Tag, Uhrzeit, Raum, Art, jede Woche oder alle 2 Wochen) einmal beim Kurs eintragen – sie erscheinen jede Woche in Kursfarbe im Kalender, in den Widgets und als Wochenübersicht unter Kurse. Vorlesungsbeginn/-ende, „Fällt aus“ für einzelne Termine und Erinnerung vor Vorlesungen
- **Projekte:** mit Titelbild, Status und eigenen Aufgaben; der Fortschritt ergibt sich aus den erledigten Aufgaben. Abschnitte (anlegen, umbenennen, sortieren, löschen) und Deadline-Countdown („noch 12 Tage“)
- **Gewohnheiten:** Aktivitätsringe wie bei Apple Fitness – Lernen (aus dem Fokus-Timer), Bewegung (aus dem Training) und Gewohnheiten – mit einstellbaren Tageszielen, Wochenleiste, Auszeichnungen und Erinnerung am Abend. Dazu Mengen-Gewohnheiten (z. B. „+ 0,25 l“), Wochenraster, Serien 🔥 und 30-Tage-Quote
- **Rückblick & Stimmung:** Wochenrückblick als wischbare, bunte Karten (Lernzeit pro Kurs, erledigte Aufgaben, Ringe, Serien, Trainings, Ausgaben, Stimmung) mit Vergleich zur Vorwoche, frühere Wochen ansehen, als Bild teilen/speichern; sonntags ab 18 Uhr eine Erinnerung. Stimmungs-Tagebuch mit fünf Gesichtern, Satz zum Tag und Schlaf, 4-Wochen-Kalender und „Was dir guttut“ (Zusammenhänge mit Training, Lernen, Schlaf, Gewohnheiten)
- **Ziele:** Vision Board nach Lebensbereichen mit Inspirationsbildern und Fortschritt
- **Finanzen:** im Stil von Apple Wallet – Budget-Karte mit „Verfügbar“, Ausgaben als Kategorien-Ring, Buchungen mit Kategoriesymbolen. Monatsbudget und Budgets pro Kategorie mit Warnung ab 90 %, Daueraufträge (Miete, Abos, Gehalt) werden jeden Monat automatisch gebucht, Spartöpfe mit Ziel und CSV-Export für Excel
- **Abos & Verträge:** alle Daueraufträge als Vertragsübersicht – Kosten pro Monat oder Jahr nach Kategorie, nächste Abbuchungen, auch vierteljährlich, halbjährlich oder jährlich. Laufzeit, Kündigungsfrist und automatische Verlängerung pro Vertrag; zwei Wochen vor der Frist kommt eine Mitteilung, mit einem Tipp wird daraus eine Aufgabe. „Gekündigt zum …“ beendet die Buchungen, und Abos, die in den Buchungen mehrmals auftauchen, schlägt AntonOS zum Speichern vor
- **Einkaufsliste:** mehrere Artikel auf einmal („Milch, 6 Eier, 500 g Hack“), automatisch nach Supermarkt-Abteilung sortiert, abhaken mit „Widerrufen“, „Häufig gekauft“-Vorschläge und Einkauf abschließen – auf Wunsch gleich als Ausgabe in den Finanzen
- **Training:** geplante und erledigte Workouts mit Dauer (zählt für den Bewegungsring)
- **Essen:** Wochenplan (Mo–So, mittags und abends) mit Rezepten oder freiem Text wie „Mensa“ und Rezeptsammlung mit Foto, Zeit, Schlagwörtern und Link zum Original. Portionen umrechnen, Vorräte abhaken und fehlende Zutaten mit einem Tipp auf die Einkaufsliste – oder gleich alle Zutaten der Woche zusammengefasst. Kochmodus mit einem Schritt pro Seite, großer Schrift und Bildschirm, der anbleibt
- **Menschen:** Geburtstage mit Countdown und Alter (auch im Kalender, Mitteilung eine Woche vorher und am Tag), Geschenkideen fürs ganze Jahr, Treffen-Tagebuch, Notizen und „Melde dich mal“ nach selbst gewähltem Abstand; Gruppen wie Familie, Freunde, Uni

### Sammlungen
- **Watchlist & Leseliste:** Serien, Filme, Bücher und Hörbücher mit Cover, Status, Fortschritt und Sternebewertung
- **Alben:** Erinnerungen mit Titelbild und Tags
- **Reisen:** Reisekarte mit Countdown, Ablauf (Flug, Zug, Unterkunft mit Uhrzeit, Gleis, Platz), Reisebudget mit Rest pro Tag (Ausgaben landen auch in den Finanzen) und Packliste nach Abschnitten mit Vorlagen (Wochenende, Städtetrip, Strand, Ski) oder eigenen Vorlagen. Reisen erscheinen als Balken im Kalender, am Vorabend kommt eine Erinnerung
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
