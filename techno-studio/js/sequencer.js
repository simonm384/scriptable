// sequencer.js
// Präziser Step-Sequencer nach dem "Tale of Two Clocks"-Prinzip:
// Ein JS-Timer plant Events im Voraus, die Web-Audio-Uhr bestimmt das exakte Timing.

export class Sequencer {
  constructor(engine) {
    this.engine = engine;
    this.steps = 16;
    this.bpm = 130;
    this.swing = 0; // 0..0.6 (Anteil eines Steps, um den Offbeats verschoben werden)
    this.isPlaying = false;

    this.currentStep = 0;
    this.nextNoteTime = 0;
    this.startTime = 0;         // Audio-Zeit des allerersten Steps
    this.bar = -1;              // aktueller Takt seit Start
    this.lookahead = 25;        // ms zwischen Timer-Ticks
    this.scheduleAhead = 0.1;   // s, die im Voraus geplant werden
    this._timer = null;

    this.tracks = [];   // [{ name, voice, pattern:[bool], note? }]
    this.onStep = null; // Callback fürs UI: (stepIndex) => void  (-1 = gestoppt)
    this.onBar = null;  // Callback bei Taktbeginn: (barIndex) => void
  }

  setTempo(bpm) { this.bpm = bpm; }
  setSwing(amount) { this.swing = amount; }

  start() {
    if (this.isPlaying) return;
    this.engine.init();
    this.engine.resume();
    this.isPlaying = true;
    this.currentStep = 0;
    this.bar = -1;
    this.nextNoteTime = this.engine.now + 0.05;
    this.startTime = this.nextNoteTime;
    this._scheduler();
  }

  stop() {
    this.isPlaying = false;
    clearTimeout(this._timer);
    if (this.onStep) this.onStep(-1);
  }

  toggle() { this.isPlaying ? this.stop() : this.start(); }

  // 16 Steps = 1 Takt -> 16tel-Noten
  _secondsPerStep() { return (60 / this.bpm) / 4; }

  _scheduler() {
    if (!this.isPlaying) return;
    while (this.nextNoteTime < this.engine.now + this.scheduleAhead) {
      // Taktbeginn: ggf. Pattern wechseln (Arrangement) BEVOR der Step geplant wird
      if (this.currentStep === 0) {
        this.bar++;
        if (this.onBar) this.onBar(this.bar);
      }
      this._scheduleStep(this.currentStep, this.nextNoteTime);
      // nächsten Step vorrücken
      this.nextNoteTime += this._secondsPerStep();
      this.currentStep = (this.currentStep + 1) % this.steps;
    }
    this._timer = setTimeout(() => this._scheduler(), this.lookahead);
  }

  _scheduleStep(step, time) {
    // Swing: ungerade 16tel leicht nach hinten schieben
    const sps = this._secondsPerStep();
    const swingOffset = step % 2 === 1 ? sps * this.swing : 0;
    const t = time + swingOffset;

    for (const track of this.tracks) {
      if (track.pattern[step]) this._trigger(track, t, step);
    }

    // UI-Playhead exakt zum hörbaren Zeitpunkt aktualisieren
    const uiDelayMs = (t - this.engine.now) * 1000;
    setTimeout(() => {
      if (this.onStep && this.isPlaying) this.onStep(step);
    }, Math.max(0, uiDelayMs));
  }

  _trigger(track, t, step) {
    const e = this.engine;
    // Eigenes Sample zugewiesen? -> als One-Shot abspielen statt Synth-Voice
    if (track.buffer) { e.playSample(track.buffer, t, track.gain == null ? 1 : track.gain); return; }
    // Melodische Tracks können pro Step eine eigene Tonhöhe in notes[] tragen.
    const note = track.notes ? track.notes[step] : track.note;
    switch (track.voice) {
      case "kick":  e.kick(t); break;
      case "clap":  e.clap(t); break;
      case "snare": e.snare(t); break;
      case "hat":   e.hat(t, false); break;
      case "ohat":  e.hat(t, true); break;
      case "bass":  e.playNote("bass", note, t, 0.9, null); break;
      case "lead":  e.playNote("lead", note, t, 0.8, null); break;
    }
  }
}
