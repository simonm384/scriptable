// app.js – verbindet Audio-Engine, Sequencer, MIDI und das UI.

import { AudioEngine } from "./audio-engine.js";
import { Sequencer } from "./sequencer.js";
import { MidiController } from "./midi.js";

const engine = new AudioEngine();
const seq = new Sequencer(engine);
const midi = new MidiController();

const STEPS = 16;

// ---------- Track-Definitionen ----------
const drumDefs = [
  { name: "Kick",     voice: "kick" },
  { name: "Clap",     voice: "clap" },
  { name: "Snare",    voice: "snare" },
  { name: "Hi-Hat",   voice: "hat" },
  { name: "Open Hat", voice: "ohat" },
];

// Bass-Tonleiter (C-Moll), von hoch nach tief dargestellt
const bassScale = [
  { name: "C3",  midi: 48 },
  { name: "Bb2", midi: 46 },
  { name: "Ab2", midi: 44 },
  { name: "G2",  midi: 43 },
  { name: "F2",  midi: 41 },
  { name: "Eb2", midi: 39 },
  { name: "D2",  midi: 38 },
  { name: "C2",  midi: 36 },
];

// Track-Objekte für den Sequencer
const drumTracks = drumDefs.map((d) => ({
  ...d,
  pattern: new Array(STEPS).fill(false),
}));

const bassTrack = {
  name: "Bass",
  voice: "bass",
  pattern: new Array(STEPS).fill(false), // aktiv ja/nein
  notes: new Array(STEPS).fill(null),    // Tonhöhe pro Step
};

seq.tracks = [...drumTracks, bassTrack];

// ---------- DOM-Referenzen ----------
const $ = (id) => document.getElementById(id);
const drumGridEl = $("drumGrid");
const bassGridEl = $("bassGrid");
const playBtn = $("playBtn");
const midiLed = $("midiLed");
const statusEl = $("status");

let drumCells = []; // [trackIndex][step]
let bassCells = []; // [rowIndex][step]

// ---------- Grid-Aufbau ----------
function buildDrumGrid() {
  drumGridEl.innerHTML = "";
  drumCells = [];
  drumTracks.forEach((track, ti) => {
    const row = document.createElement("div");
    row.className = "row";
    const label = document.createElement("div");
    label.className = "row-label";
    label.innerHTML = `<span class="dot"></span>${track.name}`;
    const steps = document.createElement("div");
    steps.className = "steps";
    const cellRow = [];
    for (let s = 0; s < STEPS; s++) {
      const cell = document.createElement("div");
      cell.className = "step";
      cell.addEventListener("click", () => {
        track.pattern[s] = !track.pattern[s];
        cell.classList.toggle("on", track.pattern[s]);
        previewDrum(track, track.pattern[s]);
      });
      steps.appendChild(cell);
      cellRow.push(cell);
    }
    drumCells.push(cellRow);
    row.append(label, steps);
    drumGridEl.appendChild(row);
  });
}

function buildBassGrid() {
  bassGridEl.innerHTML = "";
  bassCells = [];
  bassScale.forEach((noteDef, ri) => {
    const row = document.createElement("div");
    row.className = "row";
    const label = document.createElement("div");
    label.className = "row-label";
    label.textContent = noteDef.name;
    const steps = document.createElement("div");
    steps.className = "steps";
    const cellRow = [];
    for (let s = 0; s < STEPS; s++) {
      const cell = document.createElement("div");
      cell.className = "step bass";
      cell.addEventListener("click", () => toggleBassCell(ri, s));
      steps.appendChild(cell);
      cellRow.push(cell);
    }
    bassCells.push(cellRow);
    row.append(label, steps);
    bassGridEl.appendChild(row);
  });
}

// Monophone Bassline: pro Step nur eine Note
function toggleBassCell(rowIndex, step) {
  const noteDef = bassScale[rowIndex];
  const alreadyOn = bassTrack.pattern[step] && bassTrack.notes[step] === noteDef.midi;

  // Spalte zurücksetzen
  for (let r = 0; r < bassScale.length; r++) bassCells[r][step].classList.remove("on");

  if (alreadyOn) {
    bassTrack.pattern[step] = false;
    bassTrack.notes[step] = null;
  } else {
    bassTrack.pattern[step] = true;
    bassTrack.notes[step] = noteDef.midi;
    bassCells[rowIndex][step].classList.add("on");
    previewSynth("bass", noteDef.midi);
  }
}

// ---------- Vorhör-Funktionen beim Klicken (nur wenn nicht gerade läuft) ----------
function previewDrum(track, isOn) {
  if (!isOn || seq.isPlaying) return;
  engine.init(); engine.resume();
  seq._trigger(track, engine.now, 0);
}
function previewSynth(type, midiNote) {
  if (seq.isPlaying) return;
  engine.init(); engine.resume();
  engine.playNote(type, midiNote, engine.now, 0.8, null);
}

// ---------- Playhead-Anzeige ----------
function highlightStep(step) {
  document.querySelectorAll(".step.playhead").forEach((c) => c.classList.remove("playhead"));
  if (step < 0) return;
  drumCells.forEach((row) => row[step].classList.add("playhead"));
  bassCells.forEach((row) => row[step].classList.add("playhead"));
}
seq.onStep = highlightStep;

// ---------- Transport ----------
function updatePlayBtn() {
  playBtn.textContent = seq.isPlaying ? "⏸" : "▶";
  playBtn.classList.toggle("playing", seq.isPlaying);
  statusEl.textContent = seq.isPlaying
    ? "Läuft … viel Spaß! 🎛️"
    : "Gestoppt. Drücke ▶ oder die Leertaste.";
}
playBtn.addEventListener("click", () => { seq.toggle(); updatePlayBtn(); });
document.addEventListener("keydown", (e) => {
  if (e.code === "Space" && e.target.tagName !== "INPUT" && e.target.tagName !== "SELECT") {
    e.preventDefault();
    seq.toggle();
    updatePlayBtn();
  }
});

// ---------- Bedienelemente ----------
$("bpm").addEventListener("input", (e) => {
  const v = Math.min(200, Math.max(60, +e.target.value || 130));
  seq.setTempo(v);
});
$("swing").addEventListener("input", (e) => {
  seq.setSwing(+e.target.value / 100);
  $("swingVal").textContent = e.target.value + "%";
});
$("master").addEventListener("input", (e) => {
  engine.init();
  engine.setMasterVolume(+e.target.value / 100);
});

// Synth-Parameter
$("bassWave").addEventListener("change", (e) => { engine.bassParams.wave = e.target.value; });
$("cutoff").addEventListener("input", (e) => { engine.bassParams.cutoff = +e.target.value; });
$("reso").addEventListener("input", (e) => { engine.bassParams.reso = +e.target.value; });
$("decay").addEventListener("input", (e) => { engine.bassParams.decay = +e.target.value; });
$("octave").addEventListener("change", (e) => { engine.bassParams.octave = +e.target.value; });

// Zufall / Leeren
$("randomDrums").addEventListener("click", randomizeDrums);
$("clearDrums").addEventListener("click", () => {
  drumTracks.forEach((t) => t.pattern.fill(false));
  buildDrumGrid();
});
$("randomBass").addEventListener("click", randomizeBass);
$("clearBass").addEventListener("click", () => {
  bassTrack.pattern.fill(false);
  bassTrack.notes.fill(null);
  buildBassGrid();
});

function randomizeDrums() {
  drumTracks.forEach((t) => t.pattern.fill(false));
  // Kick: four-on-the-floor
  for (let s = 0; s < STEPS; s += 4) drumTracks[0].pattern[s] = true;
  // Clap auf 2 & 4
  drumTracks[1].pattern[4] = true; drumTracks[1].pattern[12] = true;
  // Hats auf Offbeats + Zufall
  for (let s = 2; s < STEPS; s += 4) drumTracks[3].pattern[s] = true;
  for (let s = 0; s < STEPS; s++) if (Math.random() < 0.18) drumTracks[3].pattern[s] = true;
  // Open Hat sparsam
  if (Math.random() < 0.6) drumTracks[4].pattern[14] = true;
  syncDrumGrid();
}

function randomizeBass() {
  bassTrack.pattern.fill(false);
  bassTrack.notes.fill(null);
  for (let s = 0; s < STEPS; s++) {
    // hauptsächlich auf Offbeats, treibend
    if (s % 2 === 1 ? Math.random() < 0.55 : Math.random() < 0.2) {
      const r = Math.floor(Math.random() * bassScale.length);
      bassTrack.pattern[s] = true;
      bassTrack.notes[s] = bassScale[r].midi;
    }
  }
  buildBassGrid();
  syncBassGrid();
}

function syncDrumGrid() {
  drumTracks.forEach((t, ti) => {
    for (let s = 0; s < STEPS; s++) drumCells[ti][s].classList.toggle("on", t.pattern[s]);
  });
}
function syncBassGrid() {
  for (let s = 0; s < STEPS; s++) {
    for (let r = 0; r < bassScale.length; r++) {
      const on = bassTrack.pattern[s] && bassTrack.notes[s] === bassScale[r].midi;
      bassCells[r][s].classList.toggle("on", on);
    }
  }
}

// ---------- MIDI ----------
const heldVoices = new Map(); // midiNote -> voice (für noteOff)

function blinkLed() {
  midiLed.classList.add("on");
  clearTimeout(blinkLed._t);
  blinkLed._t = setTimeout(() => midiLed.classList.remove("on"), 90);
}

function setupMidiHandlers() {
  midi.on("activity", blinkLed);
  midi.on("noteOn", (note, vel) => {
    engine.init(); engine.resume();
    const target = $("synthTarget").value; // "bass" | "lead"
    // dur = Infinity (≠ null) -> Note wird gehalten, bis noteOff den Release auslöst
    const held = engine.playNote(target, note, engine.now, vel, Infinity);
    heldVoices.set(note, held);
  });
  midi.on("noteOff", (note) => {
    const v = heldVoices.get(note);
    engine.stopNote(v);
    heldVoices.delete(note);
  });
  midi.on("cc", (cc, value) => {
    const norm = value / 127;
    if (cc === 74) { // Filter Cutoff
      const hz = Math.round(100 + norm * 11900);
      engine.bassParams.cutoff = hz;
      $("cutoff").value = hz;
    } else if (cc === 71) { // Resonanz
      const q = Math.round(norm * 25);
      engine.bassParams.reso = q;
      $("reso").value = q;
    } else if (cc === 1) { // Modwheel -> Decay
      const d = Math.round(50 + norm * 850);
      engine.bassParams.decay = d;
      $("decay").value = d;
    }
  });
}

async function initMidi() {
  if (!midi.supported) {
    statusEl.textContent = "Hinweis: Dieser Browser unterstützt kein Web MIDI (nutze Chrome oder Edge).";
    $("midiSelect").disabled = true;
    return;
  }
  setupMidiHandlers();
  try {
    await midi.init(populateMidiSelect);
  } catch (err) {
    statusEl.textContent = "MIDI-Zugriff nicht erlaubt: " + err.message;
  }
  $("midiSelect").addEventListener("change", (e) => {
    midi.selectInput(e.target.value);
    statusEl.textContent = e.target.value
      ? "MIDI-Gerät verbunden. Spiel ein paar Tasten! 🎹"
      : "Kein MIDI-Gerät ausgewählt.";
  });
}

function populateMidiSelect(inputs) {
  const sel = $("midiSelect");
  const prev = sel.value;
  sel.innerHTML = '<option value="">— Kein MIDI-Gerät —</option>';
  inputs.forEach((inp) => {
    const opt = document.createElement("option");
    opt.value = inp.id;
    opt.textContent = inp.name;
    sel.appendChild(opt);
  });
  // Auswahl wiederherstellen, sonst erstes Gerät automatisch wählen
  if (inputs.find((i) => i.id === prev)) {
    sel.value = prev;
  } else if (inputs.length > 0) {
    sel.value = inputs[0].id;
    midi.selectInput(inputs[0].id);
    statusEl.textContent = `MIDI erkannt: ${inputs[0].name} 🎹`;
  }
}

// ---------- Start ----------
function init() {
  buildDrumGrid();
  buildBassGrid();
  randomizeDrums();   // ein startklarer Techno-Beat
  initMidi();
  updatePlayBtn();
}
init();
