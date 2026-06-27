// app.js – verbindet Audio-Engine, Sequencer, MIDI und das UI.

import { AudioEngine } from "./audio-engine.js";
import { Sequencer } from "./sequencer.js";
import { MidiController } from "./midi.js";
import { AIComposer } from "./ai.js";
import { VocalRecorder, encodeWav } from "./recorder.js";
import * as Songs from "./storage.js";

const engine = new AudioEngine();
const seq = new Sequencer(engine);
const midi = new MidiController();
const ai = new AIComposer();
const vocals = new VocalRecorder(engine);

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

// ---------- Patterns (A/B/C/D) & Arrangement ----------
const NUM_PATTERNS = 4;
const PATTERN_NAMES = ["A", "B", "C", "D"];

function emptyPattern() {
  return {
    drums: drumDefs.map(() => new Array(STEPS).fill(false)),
    bassPattern: new Array(STEPS).fill(false),
    bassNotes: new Array(STEPS).fill(null),
  };
}
let patterns = Array.from({ length: NUM_PATTERNS }, emptyPattern);
let editIndex = 0;        // angezeigtes/bearbeitetes Pattern
let playIndex = 0;        // gerade klingendes Pattern (Arrangement)
let arrangement = [];     // Liste von Pattern-Indizes (Takte)
let arrangementOn = false;
let arrPlayPos = 0;

// "Live"-Objekte (drumTracks/bassTrack) sind die Arbeitskopie des aktiven Patterns.
function saveLiveToPattern(i) {
  const p = patterns[i];
  drumTracks.forEach((t, di) => { p.drums[di] = t.pattern.slice(); });
  p.bassPattern = bassTrack.pattern.slice();
  p.bassNotes = bassTrack.notes.slice();
}
function loadPatternToLive(i) {
  const p = patterns[i];
  drumTracks.forEach((t, di) => { for (let k = 0; k < STEPS; k++) t.pattern[k] = !!p.drums[di][k]; });
  for (let k = 0; k < STEPS; k++) {
    bassTrack.pattern[k] = !!p.bassPattern[k];
    bassTrack.notes[k] = p.bassNotes[k] == null ? null : p.bassNotes[k];
  }
}

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
let vocalSyncActive = false;

function togglePlay() {
  if (seq.isPlaying) {
    seq.stop();
    if (vocalSyncActive) { vocals.stop(); vocalSyncActive = false; }
  } else {
    seq.start();
    // Gesang taktgenau zum ersten Schlag starten
    if ($("vocSync").checked && vocals.hasRecording) {
      updateVocalParams();
      vocals.loop = true;
      vocals.play(seq.startTime);
      vocalSyncActive = true;
    }
  }
  updatePlayBtn();
  updatePatternTabs();
  updateArrangementPlayhead();
}

playBtn.addEventListener("click", togglePlay);
document.addEventListener("keydown", (e) => {
  if (e.code === "Space" && e.target.tagName !== "INPUT" && e.target.tagName !== "SELECT") {
    e.preventDefault();
    togglePlay();
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
    // dur = Infinity (≠ null) -> Note wird gehalten, bis noteOff den Release auslöst
    const held = engine.playNote(currentInstrument(), note, engine.now, vel, Infinity);
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

function currentInstrument() {
  return $("instrument").value || "bass";
}

// ---------- Bildschirm-Klaviatur ----------
const keyMap = { a:60, w:61, s:62, e:63, d:64, f:65, t:66, g:67, y:68, h:69, u:70, j:71, k:72 };
const noteNames = ["C","C#","D","D#","E","F","F#","G","G#","A","A#","B"];
const kbVoices = new Map();   // midi -> voice
const kbCells = new Map();    // midi -> DOM element

function isBlack(midi) { return [1,3,6,8,10].includes(midi % 12); }

function kbNoteOn(midi, vel = 0.85) {
  if (kbVoices.has(midi)) return;
  engine.init(); engine.resume();
  const v = engine.playNote(currentInstrument(), midi, engine.now, vel, Infinity);
  kbVoices.set(midi, v);
  const el = kbCells.get(midi);
  if (el) el.classList.add("held");
}
function kbNoteOff(midi) {
  const v = kbVoices.get(midi);
  if (v) { engine.stopNote(v); kbVoices.delete(midi); }
  const el = kbCells.get(midi);
  if (el) el.classList.remove("held");
}

function buildKeyboard() {
  const el = $("keyboard");
  el.innerHTML = "";
  kbCells.clear();
  const letterFor = {};
  Object.entries(keyMap).forEach(([k, m]) => { letterFor[m] = k; });
  for (let midi = 60; midi <= 72; midi++) {
    const key = document.createElement("div");
    key.className = "key" + (isBlack(midi) ? " black" : "");
    const letter = letterFor[midi] ? letterFor[midi].toUpperCase() : "";
    key.innerHTML = `${noteNames[midi % 12]}<br>${letter}`;
    const down = (ev) => { ev.preventDefault(); kbNoteOn(midi); };
    const up = () => kbNoteOff(midi);
    key.addEventListener("mousedown", down);
    key.addEventListener("mouseup", up);
    key.addEventListener("mouseleave", up);
    key.addEventListener("touchstart", down, { passive: false });
    key.addEventListener("touchend", up);
    kbCells.set(midi, key);
    el.appendChild(key);
  }
}

const pressedKeys = new Set();
document.addEventListener("keydown", (e) => {
  if (e.repeat || e.target.tagName === "INPUT" || e.target.tagName === "SELECT") return;
  const midi = keyMap[e.key.toLowerCase()];
  if (midi && !pressedKeys.has(e.key)) { pressedKeys.add(e.key); kbNoteOn(midi); }
});
document.addEventListener("keyup", (e) => {
  const midi = keyMap[e.key.toLowerCase()];
  if (midi) { pressedKeys.delete(e.key); kbNoteOff(midi); }
});

// ---------- Song-Zustand (Speichern/Laden) ----------
function setSliderAndParam(id, value, paramFn) {
  if (value === undefined || value === null) return;
  $(id).value = value;
  paramFn(+value);
}

function normBool16(a) {
  const r = new Array(STEPS).fill(false);
  (a || []).forEach((v, i) => { if (i < STEPS) r[i] = !!v; });
  return r;
}
function normNotes16(a) {
  const r = new Array(STEPS).fill(null);
  (a || []).forEach((v, i) => { if (i < STEPS) r[i] = (v == null ? null : v); });
  return r;
}

function getState() {
  saveLiveToPattern(editIndex);
  return {
    bpm: +$("bpm").value,
    swing: +$("swing").value,
    master: +$("master").value,
    instrument: $("instrument").value,
    synth: {
      wave: $("bassWave").value,
      cutoff: +$("cutoff").value,
      reso: +$("reso").value,
      decay: +$("decay").value,
      octave: +$("octave").value,
    },
    patterns: patterns.map((p) => ({
      drums: p.drums.map((a) => a.map((v) => (v ? 1 : 0))),
      bassPattern: p.bassPattern.map((v) => (v ? 1 : 0)),
      bassNotes: p.bassNotes.slice(),
    })),
    editIndex,
    arrangement: arrangement.slice(),
    arrangementOn,
    samples: sampleBank.map((s) => ({ id: s.id, name: s.name, b64: s.b64 })),
    trackSources: drumTracks.map((t) => t.sampleId || null),
    vocals: {
      pitch: +$("vocPitch").value, filter: +$("vocFilter").value,
      reverb: +$("vocReverb").value, delay: +$("vocDelay").value,
      gain: +$("vocGain").value, loop: $("vocLoop").checked, sync: $("vocSync").checked,
    },
  };
}

async function applyState(s) {
  if (!s) return;
  setSliderAndParam("bpm", s.bpm, (v) => seq.setTempo(v));
  setSliderAndParam("swing", s.swing, (v) => { seq.setSwing(v / 100); $("swingVal").textContent = v + "%"; });
  engine.init();
  setSliderAndParam("master", s.master, (v) => engine.setMasterVolume(v / 100));
  if (s.instrument) $("instrument").value = s.instrument;

  const sy = s.synth || {};
  if (sy.wave) { $("bassWave").value = sy.wave; engine.bassParams.wave = sy.wave; }
  setSliderAndParam("cutoff", sy.cutoff, (v) => engine.bassParams.cutoff = v);
  setSliderAndParam("reso", sy.reso, (v) => engine.bassParams.reso = v);
  setSliderAndParam("decay", sy.decay, (v) => engine.bassParams.decay = v);
  if (sy.octave !== undefined) { $("octave").value = sy.octave; engine.bassParams.octave = +sy.octave; }

  // Patterns laden (neues Format) bzw. altes Einzel-Pattern-Format konvertieren
  patterns = Array.from({ length: NUM_PATTERNS }, emptyPattern);
  if (Array.isArray(s.patterns)) {
    for (let i = 0; i < NUM_PATTERNS; i++) {
      const sp = s.patterns[i];
      if (!sp) continue;
      patterns[i] = {
        drums: drumDefs.map((_, di) => normBool16(sp.drums && sp.drums[di])),
        bassPattern: normBool16(sp.bassPattern),
        bassNotes: normNotes16(sp.bassNotes),
      };
    }
  } else if (s.drums) {
    patterns[0] = {
      drums: drumDefs.map((_, di) => normBool16(s.drums[di])),
      bassPattern: normBool16(s.bass && s.bass.pattern),
      bassNotes: normNotes16(s.bass && s.bass.notes),
    };
  }
  editIndex = Math.min(NUM_PATTERNS - 1, Math.max(0, s.editIndex || 0));
  arrangement = Array.isArray(s.arrangement) ? s.arrangement.filter((n) => n >= 0 && n < NUM_PATTERNS) : [];
  arrangementOn = !!s.arrangementOn;
  $("arrOn").checked = arrangementOn;

  loadPatternToLive(editIndex);
  buildPatternTabs();
  buildArrangement();
  buildDrumGrid(); syncDrumGrid();
  buildBassGrid(); syncBassGrid();

  // Eigene Sounds wiederherstellen und den Spuren zuweisen
  await restoreSamples(s.samples);
  drumTracks.forEach((t, i) => setTrackSource(t, (s.trackSources && s.trackSources[i]) || null));
  buildTrackInstruments();

  if (s.vocals) {
    const v = s.vocals;
    setSliderAndParam("vocPitch", v.pitch, () => {}); $("vocPitchVal").textContent = v.pitch;
    $("vocFilter").value = v.filter; $("vocReverb").value = v.reverb;
    $("vocDelay").value = v.delay; $("vocGain").value = v.gain;
    $("vocLoop").checked = !!v.loop;
    if (v.sync !== undefined) $("vocSync").checked = !!v.sync;
    updateVocalParams();
  }
}

// ---------- KI-Ergebnis auf die Grids anwenden ----------
function applyAIResult(r) {
  if (r.bpm) { $("bpm").value = Math.min(200, Math.max(60, r.bpm)); seq.setTempo(+$("bpm").value); }
  const voices = ["kick", "clap", "snare", "hat", "ohat"];
  drumTracks.forEach((t) => t.pattern.fill(false));
  voices.forEach((voice, i) => {
    const steps = (r.drums && r.drums[voice]) || [];
    steps.forEach((s) => { if (s >= 0 && s < STEPS) drumTracks[i].pattern[s] = true; });
  });
  bassTrack.pattern.fill(false);
  bassTrack.notes.fill(null);
  (r.bass || []).forEach((b) => {
    const nd = bassScale.find((n) => n.name === b.note);
    if (nd && b.step >= 0 && b.step < STEPS) {
      bassTrack.pattern[b.step] = true;
      bassTrack.notes[b.step] = nd.midi;
    }
  });
  buildDrumGrid(); syncDrumGrid();
  buildBassGrid(); syncBassGrid();
  saveLiveToPattern(editIndex);
}

// ---------- Pattern-Reiter & Arrangement (UI) ----------
function selectPattern(i) {
  saveLiveToPattern(editIndex);
  editIndex = i;
  loadPatternToLive(i);
  syncDrumGrid(); syncBassGrid();
  updatePatternTabs();
}

function buildPatternTabs() {
  const el = $("patternTabs");
  el.innerHTML = "";
  PATTERN_NAMES.forEach((name, i) => {
    const b = document.createElement("button");
    b.className = "tab";
    b.textContent = name;
    b.addEventListener("click", () => selectPattern(i));
    el.appendChild(b);
  });
  updatePatternTabs();
}
function updatePatternTabs() {
  const tabs = $("patternTabs").children;
  for (let i = 0; i < tabs.length; i++) {
    tabs[i].classList.toggle("active", i === editIndex);
    tabs[i].classList.toggle("playing", seq.isPlaying && arrangementOn && i === playIndex);
  }
}

function buildArrangement() {
  const el = $("arrangement");
  el.innerHTML = "";
  arrangement.forEach((pi, idx) => {
    const s = document.createElement("div");
    s.className = "slot";
    s.textContent = PATTERN_NAMES[pi];
    s.title = "Klicken zum Wechseln";
    s.addEventListener("click", () => {
      arrangement[idx] = (arrangement[idx] + 1) % NUM_PATTERNS;
      buildArrangement();
    });
    el.appendChild(s);
  });
  updateArrangementPlayhead();
}
function updateArrangementPlayhead() {
  const slots = $("arrangement").children;
  for (let i = 0; i < slots.length; i++) {
    slots[i].classList.toggle("playing", seq.isPlaying && arrangementOn && i === arrPlayPos);
  }
}

// Pattern-Wechsel je Takt (Arrangement-Wiedergabe)
seq.onBar = (bar) => {
  if (!arrangementOn || arrangement.length === 0) { playIndex = editIndex; return; }
  arrPlayPos = bar % arrangement.length;
  const pi = arrangement[arrPlayPos];
  if (pi !== editIndex) selectPattern(pi);
  playIndex = pi;
  updateArrangementPlayhead();
  updatePatternTabs();
};

$("patternCopy").addEventListener("click", () => {
  saveLiveToPattern(editIndex);
  const target = (editIndex + 1) % NUM_PATTERNS;
  patterns[target] = JSON.parse(JSON.stringify(patterns[editIndex]));
  statusEl.textContent = `Pattern ${PATTERN_NAMES[editIndex]} → ${PATTERN_NAMES[target]} kopiert.`;
});
$("patternClear").addEventListener("click", () => {
  drumTracks.forEach((t) => t.pattern.fill(false));
  bassTrack.pattern.fill(false);
  bassTrack.notes.fill(null);
  syncDrumGrid(); syncBassGrid();
  saveLiveToPattern(editIndex);
});
$("arrAdd").addEventListener("click", () => { arrangement.push(editIndex); buildArrangement(); });
$("arrRemove").addEventListener("click", () => { arrangement.pop(); buildArrangement(); });
$("arrClear").addEventListener("click", () => { arrangement = []; buildArrangement(); });
$("arrOn").addEventListener("change", (e) => {
  arrangementOn = e.target.checked;
  updatePatternTabs();
  updateArrangementPlayhead();
});

// ---------- WAV-Export des ganzen Tracks ----------
function triggerOffline(eng, voice, t) {
  switch (voice) {
    case "kick":  eng.kick(t); break;
    case "clap":  eng.clap(t); break;
    case "snare": eng.snare(t); break;
    case "hat":   eng.hat(t, false); break;
    case "ohat":  eng.hat(t, true); break;
  }
}

async function exportWav() {
  saveLiveToPattern(editIndex);
  const bpm = +$("bpm").value;
  const sps = (60 / bpm) / 4;
  const swing = +$("swing").value / 100;
  const bars = arrangement.length ? arrangement.slice() : [editIndex, editIndex, editIndex, editIndex];
  const totalSteps = bars.length * STEPS;
  const sr = engine.ctx ? engine.ctx.sampleRate : 44100;
  const t0 = 0.05;
  const tail = 2.0; // Ausklang für Hall/Decay
  const duration = t0 + totalSteps * sps + tail;

  const offline = new OfflineAudioContext(2, Math.ceil(duration * sr), sr);
  const oeng = new AudioEngine();
  oeng.useOfflineContext(offline, engine.master ? engine.master.gain.value : 0.8);
  oeng.bassParams = { ...engine.bassParams };

  bars.forEach((pi, bar) => {
    const p = patterns[pi];
    for (let s = 0; s < STEPS; s++) {
      const t = t0 + (bar * STEPS + s) * sps + (s % 2 === 1 ? sps * swing : 0);
      drumDefs.forEach((d, di) => {
        if (!p.drums[di][s]) return;
        const tr = drumTracks[di];
        if (tr.buffer) oeng.playSample(tr.buffer, t, tr.gain == null ? 1 : tr.gain);
        else triggerOffline(oeng, d.voice, t);
      });
      if (p.bassPattern[s]) oeng.playNote("bass", p.bassNotes[s], t, 0.9, null);
    }
  });

  // Gesang mitrendern, wenn "Im Takt mitlaufen" aktiv ist
  if ($("vocSync").checked && vocals.hasRecording) {
    updateVocalParams();
    vocals.loop = true;
    vocals.scheduleOffline(offline, oeng.master, t0, t0 + totalSteps * sps);
  }

  const buffer = await offline.startRendering();
  const blob = new Blob([encodeWav(buffer)], { type: "audio/wav" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = (($("songName").value || "techno-track").trim().replace(/[^\w.-]+/g, "_")) + ".wav";
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

$("wavExport").addEventListener("click", async () => {
  $("wavExport").disabled = true;
  statusEl.textContent = "Rendere WAV … einen Moment ⏳";
  try {
    await exportWav();
    statusEl.textContent = "WAV-Datei exportiert. 🎵";
  } catch (err) {
    statusEl.textContent = "Export-Fehler: " + err.message;
  } finally {
    $("wavExport").disabled = false;
  }
});

// ---------- Spuren & eigene Sounds (Samples) ----------
const sampleBank = []; // [{ id, name, buffer, b64 }]
let sampleSeq = 1;

function arrayBufferToBase64(buf) {
  const bytes = new Uint8Array(buf);
  let bin = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    bin += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
  }
  return btoa(bin);
}
function base64ToArrayBuffer(b64) {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes.buffer;
}

async function addSampleFile(file) {
  const arr = await file.arrayBuffer();
  let buffer;
  try {
    buffer = await engine.decodeFile(arr.slice(0)); // Kopie: decodeAudioData "verbraucht" den Buffer
  } catch (err) {
    $("sampleStatus").textContent = `„${file.name}" konnte nicht gelesen werden (Format?).`;
    return false;
  }
  const b64 = arrayBufferToBase64(arr);
  sampleBank.push({ id: "s" + (sampleSeq++), name: file.name.replace(/\.[^.]+$/, ""), buffer, b64 });
  return true;
}

function setTrackSource(track, sampleId) {
  track.sampleId = sampleId || null;
  const s = sampleId ? sampleBank.find((x) => x.id === sampleId) : null;
  track.buffer = s ? s.buffer : null;
}

function previewTrack(track) {
  engine.init(); engine.resume();
  seq._trigger(track, engine.now, 0);
}

function buildTrackInstruments() {
  const el = $("trackInstruments");
  el.innerHTML = "";
  drumTracks.forEach((track) => {
    const row = document.createElement("div");
    row.className = "track-inst";

    const name = document.createElement("div");
    name.className = "ti-name";
    name.innerHTML = `<span class="dot"></span>${track.name}`;

    const sel = document.createElement("select");
    const synthOpt = document.createElement("option");
    synthOpt.value = "";
    synthOpt.textContent = "🎛️ Synth (Standard)";
    sel.appendChild(synthOpt);
    sampleBank.forEach((s) => {
      const o = document.createElement("option");
      o.value = s.id;
      o.textContent = "🎵 " + s.name + (s.buffer ? "" : " (fehlt)");
      sel.appendChild(o);
    });
    sel.value = track.sampleId || "";
    sel.addEventListener("change", () => setTrackSource(track, sel.value));

    const prev = document.createElement("button");
    prev.className = "ti-prev";
    prev.textContent = "▶";
    prev.title = "Vorhören";
    prev.addEventListener("click", () => previewTrack(track));

    row.append(name, sel, prev);
    el.appendChild(row);
  });
}

async function restoreSamples(list) {
  sampleBank.length = 0;
  if (!Array.isArray(list)) return;
  for (const s of list) {
    let buffer = null;
    if (s.b64) {
      try { buffer = await engine.decodeFile(base64ToArrayBuffer(s.b64)); } catch (e) { /* überspringen */ }
    }
    sampleBank.push({ id: s.id, name: s.name, buffer, b64: s.b64 || null });
    const n = parseInt(String(s.id || "s0").replace(/\D/g, ""), 10);
    if (!isNaN(n) && n >= sampleSeq) sampleSeq = n + 1;
  }
}

$("sampleImport").addEventListener("change", async (e) => {
  const files = Array.from(e.target.files);
  $("sampleStatus").textContent = "Lade Dateien …";
  let ok = 0;
  for (const f of files) { if (await addSampleFile(f)) ok++; }
  buildTrackInstruments();
  if (ok) $("sampleStatus").textContent = `${ok} Sound(s) geladen. Oben einer Spur zuweisen. 🎵`;
  e.target.value = "";
});

// ---------- Song-Bar verdrahten ----------
function refreshSongList() {
  const sel = $("songSelect");
  const prev = sel.value;
  sel.innerHTML = '<option value="">— Gespeicherte Songs —</option>';
  Songs.listSongs().forEach((name) => {
    const o = document.createElement("option");
    o.value = name; o.textContent = name;
    sel.appendChild(o);
  });
  if (Songs.listSongs().includes(prev)) sel.value = prev;
}

$("songSave").addEventListener("click", () => {
  const name = ($("songName").value || "").trim() || "Mein Techno-Song";
  const state = getState();
  try {
    Songs.saveSong(name, state);
    statusEl.textContent = `Song „${name}" gespeichert. 💾`;
  } catch (err) {
    // Browser-Speicher voll (oft wegen großer Sound-Dateien): ohne Audio speichern
    try {
      const slim = { ...state, samples: (state.samples || []).map((s) => ({ id: s.id, name: s.name })) };
      Songs.saveSong(name, slim);
      statusEl.textContent = `„${name}" gespeichert – ohne Sound-Dateien (zu groß für Browser-Speicher). Nutze „⬇ Als Datei" inkl. Sounds.`;
    } catch (e2) {
      statusEl.textContent = "Speichern fehlgeschlagen: Browser-Speicher voll.";
    }
  }
  refreshSongList();
  $("songSelect").value = name;
});
$("songLoad").addEventListener("click", async () => {
  const name = $("songSelect").value;
  if (!name) return;
  await applyState(Songs.loadSong(name));
  $("songName").value = name;
  statusEl.textContent = `Song „${name}" geladen.`;
});
$("songDelete").addEventListener("click", () => {
  const name = $("songSelect").value;
  if (!name) return;
  Songs.deleteSong(name);
  refreshSongList();
  statusEl.textContent = `Song „${name}" gelöscht.`;
});
$("songExport").addEventListener("click", async () => {
  const name = ($("songName").value || "techno-song").trim();
  const state = getState();
  state.vocalAudio = await vocals.exportBase64(); // Gesang mit exportieren
  Songs.downloadSong(name, state);
});
$("songImport").addEventListener("change", async (e) => {
  const file = e.target.files[0];
  if (!file) return;
  try {
    const { name, state } = await Songs.readSongFile(file);
    await applyState(state);
    if (state.vocalAudio) { await vocals.importBase64(state.vocalAudio); enableVocalButtons(); }
    if (name) $("songName").value = name;
    statusEl.textContent = `Song aus Datei geladen.`;
  } catch (err) {
    statusEl.textContent = "Datei konnte nicht geladen werden: " + err.message;
  }
  e.target.value = "";
});

// ---------- KI / Claude ----------
function aiSay(msg, cls = "") { const el = $("aiStatus"); el.textContent = msg; el.className = "ai-status " + cls; }

if (ai.hasKey) aiSay("API-Schlüssel hinterlegt. Beschreibe einen Stil und erzeuge ein Pattern. ✅", "ok");

$("aiKeyBtn").addEventListener("click", () => {
  const current = ai.hasKey ? "(bereits hinterlegt)" : "";
  const key = window.prompt(
    "Anthropic API-Schlüssel eingeben " + current +
    "\n(wird nur lokal im Browser gespeichert):", "");
  if (key === null) return;
  ai.setKey(key);
  aiSay(ai.hasKey ? "Schlüssel gespeichert. ✅" : "Schlüssel entfernt.", ai.hasKey ? "ok" : "");
});

$("aiGenerate").addEventListener("click", async () => {
  if (!ai.hasKey) { aiSay("Bitte zuerst einen API-Schlüssel hinterlegen (Button rechts).", "err"); return; }
  const prompt = $("aiPrompt").value;
  aiSay("Claude komponiert … einen Moment ⏳", "busy");
  $("aiGenerate").disabled = true;
  try {
    const result = await ai.generate(prompt);
    applyAIResult(result);
    aiSay("Fertig! " + (result.notes || "Pattern geladen. 🎶"), "ok");
  } catch (err) {
    aiSay("Fehler: " + err.message, "err");
  } finally {
    $("aiGenerate").disabled = false;
  }
});

// ---------- Gesang ----------
function vocSay(msg) { $("vocStatus").textContent = msg; }
function enableVocalButtons() {
  $("vocPlay").disabled = !vocals.hasRecording;
  $("vocStop").disabled = !vocals.hasRecording;
}
function updateVocalParams() {
  vocals.params.pitch = +$("vocPitch").value;
  vocals.params.cutoff = +$("vocFilter").value;
  vocals.params.reverb = +$("vocReverb").value / 100;
  vocals.params.delay = +$("vocDelay").value / 100;
  vocals.params.gain = +$("vocGain").value / 100;
  vocals.loop = $("vocLoop").checked;
}

let recording = false;
$("recBtn").addEventListener("click", async () => {
  if (!vocals.supported) { vocSay("Aufnahme wird von diesem Browser nicht unterstützt."); return; }
  if (!recording) {
    try {
      await vocals.startRecording();
      recording = true;
      $("recBtn").textContent = "■ Stoppen";
      $("recBtn").classList.add("rec-on");
      vocSay("Aufnahme läuft … singe los! 🎤");
    } catch (err) {
      vocSay("Mikrofon-Zugriff abgelehnt: " + err.message);
    }
  } else {
    try {
      const dur = await vocals.stopRecording();
      vocSay(`Aufnahme gespeichert (${dur.toFixed(1)}s). Mit den Reglern verändern & abspielen.`);
    } catch (err) {
      vocSay("Aufnahme-Fehler: " + err.message);
    }
    recording = false;
    $("recBtn").textContent = "● Aufnehmen";
    $("recBtn").classList.remove("rec-on");
    enableVocalButtons();
  }
});

$("vocPlay").addEventListener("click", () => { updateVocalParams(); vocals.play(); });
$("vocStop").addEventListener("click", () => vocals.stop());
["vocFilter", "vocReverb", "vocDelay", "vocGain"].forEach((id) =>
  $(id).addEventListener("input", updateVocalParams));
$("vocPitch").addEventListener("input", (e) => { $("vocPitchVal").textContent = e.target.value; updateVocalParams(); });
$("vocLoop").addEventListener("change", updateVocalParams);

// ---------- Start ----------
function init() {
  buildDrumGrid();
  buildBassGrid();
  buildKeyboard();
  randomizeDrums();   // ein startklarer Techno-Beat in Pattern A
  saveLiveToPattern(0);
  buildPatternTabs();
  buildArrangement();
  buildTrackInstruments();
  refreshSongList();
  initMidi();
  updatePlayBtn();
}
init();
