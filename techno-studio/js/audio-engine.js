// audio-engine.js
// Synthetisiert alle Sounds live mit der Web Audio API – keine Samples nötig.

export class AudioEngine {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.bassParams = { wave: "sawtooth", cutoff: 1200, reso: 8, decay: 280, octave: 0 };
    this._noiseBuffer = null;
  }

  /** Muss durch eine Nutzer-Interaktion gestartet werden (Autoplay-Richtlinie). */
  init() {
    if (this.ctx) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    this.ctx = new AC();
    this.master = this.ctx.createGain();
    this.master.gain.value = 0.8;
    // sanfter Limiter, damit nichts übersteuert
    const comp = this.ctx.createDynamicsCompressor();
    comp.threshold.value = -8;
    comp.ratio.value = 12;
    comp.attack.value = 0.003;
    comp.release.value = 0.25;
    this.master.connect(comp).connect(this.ctx.destination);
    this._buildNoise();
  }

  resume() {
    if (this.ctx && this.ctx.state === "suspended") this.ctx.resume();
  }

  setMasterVolume(v) {
    if (this.master) this.master.gain.value = v;
  }

  get now() { return this.ctx.currentTime; }

  _buildNoise() {
    const len = this.ctx.sampleRate * 1.5;
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    this._noiseBuffer = buf;
  }

  _noiseSource() {
    const src = this.ctx.createBufferSource();
    src.buffer = this._noiseBuffer;
    src.loop = true;
    return src;
  }

  // ---------- DRUM-VOICES ----------

  kick(t = this.now, gain = 1) {
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = "sine";
    osc.frequency.setValueAtTime(150, t);
    osc.frequency.exponentialRampToValueAtTime(45, t + 0.12);
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.42);
    osc.connect(g).connect(this.master);
    osc.start(t);
    osc.stop(t + 0.45);
  }

  clap(t = this.now, gain = 0.7) {
    const out = this.ctx.createGain();
    out.gain.value = gain;
    const filt = this.ctx.createBiquadFilter();
    filt.type = "bandpass";
    filt.frequency.value = 1400;
    filt.Q.value = 1.2;
    filt.connect(out).connect(this.master);
    // drei kurze Bursts -> typischer Clap
    [0, 0.012, 0.024].forEach((d) => {
      const src = this._noiseSource();
      const g = this.ctx.createGain();
      g.gain.setValueAtTime(0.0, t + d);
      g.gain.linearRampToValueAtTime(0.9, t + d + 0.002);
      g.gain.exponentialRampToValueAtTime(0.001, t + d + 0.05);
      src.connect(g).connect(filt);
      src.start(t + d);
      src.stop(t + d + 0.06);
    });
    // Schweif
    const tail = this._noiseSource();
    const tg = this.ctx.createGain();
    tg.gain.setValueAtTime(0.5, t + 0.024);
    tg.gain.exponentialRampToValueAtTime(0.001, t + 0.22);
    tail.connect(tg).connect(filt);
    tail.start(t + 0.024);
    tail.stop(t + 0.24);
  }

  snare(t = this.now, gain = 0.7) {
    // Ton-Anteil
    const osc = this.ctx.createOscillator();
    const og = this.ctx.createGain();
    osc.type = "triangle";
    osc.frequency.setValueAtTime(180, t);
    og.gain.setValueAtTime(gain * 0.6, t);
    og.gain.exponentialRampToValueAtTime(0.001, t + 0.12);
    osc.connect(og).connect(this.master);
    osc.start(t); osc.stop(t + 0.14);
    // Rausch-Anteil
    const src = this._noiseSource();
    const filt = this.ctx.createBiquadFilter();
    filt.type = "highpass";
    filt.frequency.value = 1200;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.18);
    src.connect(filt).connect(g).connect(this.master);
    src.start(t); src.stop(t + 0.2);
  }

  hat(t = this.now, open = false, gain = 0.4) {
    const src = this._noiseSource();
    const filt = this.ctx.createBiquadFilter();
    filt.type = "highpass";
    filt.frequency.value = 8000;
    const g = this.ctx.createGain();
    const dur = open ? 0.3 : 0.05;
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    src.connect(filt).connect(g).connect(this.master);
    src.start(t); src.stop(t + dur + 0.02);
  }

  // ---------- SYNTH-VOICES (Bass / Lead) ----------

  /**
   * Spielt eine Note. type = "bass" | "lead".
   * midiNote = MIDI-Notennummer, velocity 0..1.
   * Bei dur=null klingt die Note mit eigenem Decay aus (für Sequencer/Trigger).
   */
  playNote(type, midiNote, t = this.now, velocity = 0.9, dur = null) {
    const p = this.bassParams;
    const freq = this._midiToFreq(midiNote + p.octave * 12);
    const isLead = type === "lead";

    const filt = this.ctx.createBiquadFilter();
    filt.type = "lowpass";
    filt.frequency.value = isLead ? Math.max(p.cutoff, 2000) : p.cutoff;
    filt.Q.value = p.reso;

    const amp = this.ctx.createGain();
    const decay = p.decay / 1000;
    amp.gain.setValueAtTime(0.0001, t);
    amp.gain.linearRampToValueAtTime(velocity * (isLead ? 0.35 : 0.5), t + 0.005);

    const oscs = [];
    if (isLead) {
      // zwei leicht verstimmte Saws -> fetter Stab
      [-7, 7].forEach((cents) => {
        const o = this.ctx.createOscillator();
        o.type = "sawtooth";
        o.frequency.value = freq;
        o.detune.value = cents;
        oscs.push(o);
      });
    } else {
      const o = this.ctx.createOscillator();
      o.type = p.wave;
      o.frequency.value = freq;
      oscs.push(o);
      // Sub-Oszillator für mehr Druck
      const sub = this.ctx.createOscillator();
      sub.type = "sine";
      sub.frequency.value = freq / 2;
      oscs.push(sub);
    }

    oscs.forEach((o) => o.connect(filt));
    filt.connect(amp).connect(this.master);

    let stopAt;
    if (dur === null) {
      // getriggerte Note (Step-Sequencer)
      amp.gain.exponentialRampToValueAtTime(0.0001, t + decay);
      stopAt = t + decay + 0.02;
    } else {
      // gehaltene Note (MIDI noteOn bis noteOff) – Release folgt bei stop()
      stopAt = null;
    }

    oscs.forEach((o) => o.start(t));
    if (stopAt !== null) oscs.forEach((o) => o.stop(stopAt));

    return { oscs, amp, filt };
  }

  /** Beendet eine gehaltene Note (MIDI noteOff) mit kurzem Release. */
  stopNote(voice) {
    if (!voice) return;
    const t = this.now;
    const rel = 0.12;
    try {
      voice.amp.gain.cancelScheduledValues(t);
      voice.amp.gain.setValueAtTime(voice.amp.gain.value, t);
      voice.amp.gain.exponentialRampToValueAtTime(0.0001, t + rel);
      voice.oscs.forEach((o) => o.stop(t + rel + 0.02));
    } catch (e) { /* bereits gestoppt */ }
  }

  _midiToFreq(n) { return 440 * Math.pow(2, (n - 69) / 12); }
}
