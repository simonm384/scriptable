# 🎛️ Techno Studio

Eine einfach zu bedienende Techno-Produktions-Software, die **direkt im Browser am PC** läuft –
ohne Installation. Alle Sounds (Kick, Clap, Snare, Hats, Bass, Lead) werden live mit der
**Web Audio API** synthetisiert, also sind **keine Sample-Downloads** nötig. Ein
**MIDI-Keyboard/Controller** kann angeschlossen werden, um den Synth zu spielen und Filter zu steuern.

## Schnellstart

### Windows – am einfachsten (Doppelklick)

1. Doppelklick auf **`start.bat`** im Ordner `techno-studio`.
2. Ein schwarzes Fenster öffnet sich und der Browser startet automatisch unter
   <http://localhost:8000>.
3. Das schwarze Fenster **offen lassen**, solange du Musik machst. Zum Beenden einfach schließen.

> Beim ersten Start meldet Windows evtl. „PC wurde geschützt" → auf **„Weitere Informationen"**
> → **„Trotzdem ausführen"** klicken. Falls Python fehlt, sagt dir das Fenster, wie du es
> (einmalig, kostenlos) installierst.

### Mac / Linux / manuell

Web MIDI funktioniert nur in einem „sicheren Kontext" (also über `localhost`, nicht per
Doppelklick als `file://`). Darum die App über einen kleinen lokalen Server öffnen:

```bash
cd techno-studio
python3 -m http.server 8000
```

Dann im **Chrome** oder **Edge** öffnen: <http://localhost:8000>

> Hinweis: Web MIDI wird aktuell von Chrome und Edge unterstützt, **nicht** von Safari/Firefox.
> Das Sequencing und alle Sounds funktionieren aber in jedem modernen Browser – nur der
> MIDI-Anschluss braucht Chrome/Edge.

## Funktionen im Überblick

- 🥁 **Drum-Sequencer** (Kick, Clap, Snare, Hi-Hat, Open Hat)
- 🎚️ **Bass-Sequencer** + spielbarer Synth
- 🎹 **5 Instrumente** (Bass, Lead, Pluck, Pad, Keys) – per MIDI **oder** Bildschirm-Klaviatur spielbar
- 💾 **Songs speichern & laden** (im Browser und als `.json`-Datei)
- 🤖 **KI-Producer (Claude)** – beschreibe einen Stil, Claude baut Beat & Bassline
- 🎤 **Gesang aufnehmen & verändern** (Tonhöhe, Filter, Hall, Echo)

## Bedienung

| Element            | Funktion                                                              |
|--------------------|----------------------------------------------------------------------|
| ▶ / Leertaste      | Start / Stopp                                                        |
| **BPM**            | Tempo (Techno: ~125–135)                                             |
| **Swing**          | Groove – verschiebt Offbeats leicht nach hinten                     |
| **Volume**         | Master-Lautstärke                                                    |
| **Drum-Grid**      | Felder anklicken = Schlag an/aus. Jede 4. Spalte = Viertel-Zählzeit  |
| **Synth-Grid**     | Bassline klicken (eine Note pro Spalte)                              |
| **Instrument**     | Wähle das Instrument für MIDI-Keyboard und Bildschirm-Klaviatur      |
| **Klaviatur**      | Klicken oder Tasten `A S D F G H J K` (+ `W E T Y U` für Halbtöne)   |
| **Zufall / Leeren**| Pattern automatisch erzeugen oder löschen                           |

### Song speichern & laden

- **💾 Speichern** legt den Song unter dem eingegebenen Namen im Browser ab.
- **Laden / Löschen** über die Auswahlliste.
- **⬇ Als Datei** exportiert den kompletten Song (inkl. Gesangsaufnahme) als `.json`.
- **⬆ Datei laden** importiert eine solche Datei wieder.

### 🤖 KI-Producer (Claude)

1. Auf **API-Schlüssel** klicken und einen Anthropic-API-Schlüssel eingeben
   (von <https://console.anthropic.com> – wird nur lokal im Browser gespeichert).
2. Einen Stil beschreiben, z. B. *„düsterer harter Warehouse-Techno mit rollendem Bass"*.
3. **✨ Pattern erzeugen** – Claude (`claude-opus-4-8`) baut Drums, Bassline und setzt das Tempo.

> Hinweis: Der Schlüssel wird direkt aus dem Browser an die Anthropic-API gesendet und nur
> lokal gespeichert. Nutze das nur auf deinem eigenen Rechner. Es können API-Kosten anfallen.

### 🎤 Gesang aufnehmen

1. **● Aufnehmen** klicken und Mikrofon-Zugriff erlauben → singen → **■ Stoppen**.
2. **▶ Abspielen** und mit den Reglern **Tonhöhe, Filter, Hall, Echo** verändern.
3. **Loop** aktiviert die Endloswiedergabe. Die Aufnahme wird beim Datei-Export mitgespeichert.

### MIDI-Keyboard / Controller

1. Gerät per USB anschließen **bevor** oder **während** die Seite offen ist.
2. Oben rechts unter **MIDI Input** das Gerät auswählen (das erste wird automatisch gewählt).
3. Tasten spielen → steuert das unter **Instrument** gewählte Instrument.
4. Die LED blinkt bei MIDI-Aktivität.

**Belegte Controller (CC):**

| CC  | Steuert            |
|-----|--------------------|
| 74  | Filter-Cutoff      |
| 71  | Resonanz           |
| 1   | Modwheel → Decay   |

Die meisten Keyboards (AKAI MPK Mini, Arturia MiniLab, Novation Launchkey …) senden diese
Standard-CCs bereits auf ihren Reglern.

## Aufbau des Codes

```
techno-studio/
├── index.html          # UI-Struktur
├── css/style.css       # dunkle Techno-Optik
└── js/
    ├── audio-engine.js # Synthese aller Sounds & Instrumente (Web Audio API)
    ├── sequencer.js    # präziser Step-Sequencer (Lookahead-Scheduling)
    ├── midi.js         # Web-MIDI-Anbindung
    ├── ai.js           # KI-Producer (Anthropic / Claude API)
    ├── recorder.js     # Gesangsaufnahme + Effektkette
    ├── storage.js      # Songs speichern/laden (localStorage & Datei)
    └── app.js          # verbindet UI, Sequencer, MIDI, KI, Gesang und Audio
```

Reines Vanilla-JavaScript (ES-Module), keine externen Abhängigkeiten.
