// midi.js
// Web-MIDI-API: erkennt angeschlossene Keyboards/Controller, leitet Noten & CCs weiter.

export class MidiController {
  constructor() {
    this.access = null;
    this.currentInput = null;
    this.handlers = {
      noteOn: () => {},   // (note, velocity)
      noteOff: () => {},  // (note)
      cc: () => {},       // (controller, value 0..127)
      activity: () => {}, // () -> LED blinken
    };
  }

  get supported() {
    return typeof navigator !== "undefined" && !!navigator.requestMIDIAccess;
  }

  async init(onDeviceListChange) {
    if (!this.supported) throw new Error("Web MIDI wird von diesem Browser nicht unterstützt.");
    this.access = await navigator.requestMIDIAccess({ sysex: false });
    this.access.onstatechange = () => onDeviceListChange(this.listInputs());
    onDeviceListChange(this.listInputs());
    return this.listInputs();
  }

  listInputs() {
    if (!this.access) return [];
    return Array.from(this.access.inputs.values()).map((i) => ({
      id: i.id,
      name: i.name || "Unbekanntes Gerät",
    }));
  }

  selectInput(id) {
    // alten Listener entfernen
    if (this.currentInput) this.currentInput.onmidimessage = null;
    this.currentInput = null;
    if (!id || !this.access) return;
    const input = this.access.inputs.get(id);
    if (!input) return;
    this.currentInput = input;
    input.onmidimessage = (msg) => this._onMessage(msg);
  }

  on(event, fn) { this.handlers[event] = fn; }

  _onMessage(msg) {
    const [status, d1, d2] = msg.data;
    const cmd = status & 0xf0;
    this.handlers.activity();

    if (cmd === 0x90 && d2 > 0) {            // Note On
      this.handlers.noteOn(d1, d2 / 127);
    } else if (cmd === 0x80 || (cmd === 0x90 && d2 === 0)) { // Note Off
      this.handlers.noteOff(d1);
    } else if (cmd === 0xb0) {               // Control Change
      this.handlers.cc(d1, d2);
    }
  }
}
