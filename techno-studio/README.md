# 🎛️ Techno Studio

Eine einfach zu bedienende Techno-Produktions-Software, die **direkt im Browser am PC** läuft –
ohne Installation. Alle Sounds (Kick, Clap, Snare, Hats, Bass, Lead) werden live mit der
**Web Audio API** synthetisiert, also sind **keine Sample-Downloads** nötig. Ein
**MIDI-Keyboard/Controller** kann angeschlossen werden, um den Synth zu spielen und Filter zu steuern.

## Schnellstart

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

## Bedienung

| Element            | Funktion                                                              |
|--------------------|----------------------------------------------------------------------|
| ▶ / Leertaste      | Start / Stopp                                                        |
| **BPM**            | Tempo (Techno: ~125–135)                                             |
| **Swing**          | Groove – verschiebt Offbeats leicht nach hinten                     |
| **Volume**         | Master-Lautstärke                                                    |
| **Drum-Grid**      | Felder anklicken = Schlag an/aus. Jede 4. Spalte = Viertel-Zählzeit  |
| **Synth-Grid**     | Bassline klicken (eine Note pro Spalte)                              |
| **Zufall / Leeren**| Pattern automatisch erzeugen oder löschen                           |

### MIDI-Keyboard / Controller

1. Gerät per USB anschließen **bevor** oder **während** die Seite offen ist.
2. Oben rechts unter **MIDI Input** das Gerät auswählen (das erste wird automatisch gewählt).
3. Tasten spielen → steuert den unter „Spielen mit MIDI" gewählten Synth (Bass oder Lead).
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
    ├── audio-engine.js # Synthese aller Sounds (Web Audio API)
    ├── sequencer.js    # präziser Step-Sequencer (Lookahead-Scheduling)
    ├── midi.js         # Web-MIDI-Anbindung
    └── app.js          # verbindet UI, Sequencer, MIDI und Audio
```

Reines Vanilla-JavaScript (ES-Module), keine externen Abhängigkeiten.
