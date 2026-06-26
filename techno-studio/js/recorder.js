// recorder.js
// Nimmt Gesang über das Mikrofon auf (MediaRecorder) und spielt ihn
// durch eine Effektkette (Filter, Pitch, Hall, Echo) wieder ab.

export class VocalRecorder {
  constructor(engine) {
    this.engine = engine;
    this.buffer = null;       // dekodierter AudioBuffer
    this.recorder = null;
    this.stream = null;
    this.chunks = [];
    this.voice = null;        // laufende Wiedergabe
    this.loop = false;
    this.params = {
      gain: 1.0,
      pitch: 0,     // Halbtöne -12..+12
      cutoff: 12000,
      reverb: 0.25, // 0..1 Wet-Anteil
      delay: 0.0,   // 0..1 Wet-Anteil
      feedback: 0.3,
    };
    this._impulse = null;
  }

  get supported() {
    return typeof navigator !== "undefined" &&
      navigator.mediaDevices && typeof MediaRecorder !== "undefined";
  }

  get hasRecording() { return !!this.buffer; }

  async startRecording() {
    this.engine.init();
    this.stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    this.recorder = new MediaRecorder(this.stream);
    this.chunks = [];
    this.recorder.ondataavailable = (e) => { if (e.data.size) this.chunks.push(e.data); };
    this.recorder.start();
  }

  /** Beendet die Aufnahme; Promise löst mit der Länge (Sekunden) auf. */
  stopRecording() {
    return new Promise((resolve, reject) => {
      if (!this.recorder) return reject(new Error("Keine Aufnahme aktiv."));
      this.recorder.onstop = async () => {
        try {
          const blob = new Blob(this.chunks, { type: this.recorder.mimeType });
          const arr = await blob.arrayBuffer();
          this.buffer = await this.engine.ctx.decodeAudioData(arr);
          this.stream.getTracks().forEach((t) => t.stop());
          resolve(this.buffer.duration);
        } catch (err) { reject(err); }
      };
      this.recorder.stop();
    });
  }

  // Hall-Impulsantwort (kurzer, abklingender Rauschschwanz)
  _getImpulse() {
    if (this._impulse) return this._impulse;
    const ctx = this.engine.ctx;
    const len = Math.floor(ctx.sampleRate * 1.8);
    const buf = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const d = buf.getChannelData(ch);
      for (let i = 0; i < len; i++) {
        d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2.5);
      }
    }
    this._impulse = buf;
    return buf;
  }

  /** Spielt die Aufnahme durch die Effektkette ab. */
  play() {
    if (!this.buffer) return;
    this.stop();
    const ctx = this.engine.ctx;
    this.engine.resume();
    const p = this.params;

    const src = ctx.createBufferSource();
    src.buffer = this.buffer;
    src.loop = this.loop;
    src.detune.value = p.pitch * 100; // Halbtöne -> Cents

    const filt = ctx.createBiquadFilter();
    filt.type = "lowpass";
    filt.frequency.value = p.cutoff;

    const out = ctx.createGain();
    out.gain.value = p.gain;

    // Dry-Signal
    src.connect(filt);
    filt.connect(out);

    // Hall (Convolver)
    const verb = ctx.createConvolver();
    verb.buffer = this._getImpulse();
    const verbWet = ctx.createGain();
    verbWet.gain.value = p.reverb;
    filt.connect(verb).connect(verbWet).connect(out);

    // Echo (Delay mit Feedback)
    const delay = ctx.createDelay(1.0);
    delay.delayTime.value = 0.3;
    const fb = ctx.createGain();
    fb.gain.value = p.feedback;
    const delayWet = ctx.createGain();
    delayWet.gain.value = p.delay;
    filt.connect(delay);
    delay.connect(fb).connect(delay);
    delay.connect(delayWet).connect(out);

    out.connect(this.engine.master);
    src.start();
    this.voice = { src, out };
    src.onended = () => { if (this.voice && this.voice.src === src) this.voice = null; };
  }

  stop() {
    if (this.voice) {
      try { this.voice.src.stop(); } catch (e) { /* schon gestoppt */ }
      this.voice = null;
    }
  }

  get isPlaying() { return !!this.voice; }

  /** Aufnahme als WAV-Daten (für Song-Speicherung). Base64 ohne Header-Präfix. */
  async exportBase64() {
    if (!this.buffer) return null;
    const wav = encodeWav(this.buffer);
    return await blobToBase64(new Blob([wav]));
  }

  async importBase64(b64) {
    if (!b64) { this.buffer = null; return; }
    this.engine.init();
    const arr = base64ToArrayBuffer(b64);
    this.buffer = await this.engine.ctx.decodeAudioData(arr);
  }
}

// ---------- WAV-Kodierung (16-bit PCM) ----------
function encodeWav(audioBuffer) {
  const numCh = audioBuffer.numberOfChannels;
  const sr = audioBuffer.sampleRate;
  const len = audioBuffer.length;
  const bytesPerSample = 2;
  const blockAlign = numCh * bytesPerSample;
  const dataSize = len * blockAlign;
  const buffer = new ArrayBuffer(44 + dataSize);
  const view = new DataView(buffer);

  const writeStr = (off, s) => { for (let i = 0; i < s.length; i++) view.setUint8(off + i, s.charCodeAt(i)); };
  writeStr(0, "RIFF");
  view.setUint32(4, 36 + dataSize, true);
  writeStr(8, "WAVE");
  writeStr(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);          // PCM
  view.setUint16(22, numCh, true);
  view.setUint32(24, sr, true);
  view.setUint32(28, sr * blockAlign, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, 16, true);
  writeStr(36, "data");
  view.setUint32(40, dataSize, true);

  let off = 44;
  const channels = [];
  for (let c = 0; c < numCh; c++) channels.push(audioBuffer.getChannelData(c));
  for (let i = 0; i < len; i++) {
    for (let c = 0; c < numCh; c++) {
      let s = Math.max(-1, Math.min(1, channels[c][i]));
      view.setInt16(off, s < 0 ? s * 0x8000 : s * 0x7fff, true);
      off += 2;
    }
  }
  return buffer;
}

function blobToBase64(blob) {
  return new Promise((resolve) => {
    const r = new FileReader();
    r.onloadend = () => resolve(r.result.split(",")[1]); // Daten ohne data:-Präfix
    r.readAsDataURL(blob);
  });
}

function base64ToArrayBuffer(b64) {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes.buffer;
}
