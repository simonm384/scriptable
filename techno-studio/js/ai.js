// ai.js
// Bindet Claude (Anthropic API) ein: aus einer Textbeschreibung erzeugt Claude
// ein Techno-Pattern (Drums + Bassline) als strukturiertes JSON.
//
// Hinweis: Der API-Schlüssel wird lokal im Browser (localStorage) gespeichert
// und direkt an die Anthropic-API gesendet ("dangerous-direct-browser-access").
// Das ist für ein lokales Tool ok – teile die Datei nicht mit deinem Schlüssel.

const API_URL = "https://api.anthropic.com/v1/messages";
const MODEL = "claude-opus-4-8";
const KEY_STORAGE = "techno_studio_api_key";

// Verfügbare Bass-Notennamen (müssen zur Tonleiter in app.js passen)
export const BASS_NOTE_NAMES = ["C2", "D2", "Eb2", "F2", "G2", "Ab2", "Bb2", "C3"];

// JSON-Schema für strukturierte Ausgabe (output_config.format)
const SCHEMA = {
  type: "object",
  properties: {
    bpm: { type: "integer", description: "Tempo, typisch 120-140 für Techno" },
    drums: {
      type: "object",
      description: "Aktive Steps (0-15) je Instrument",
      properties: {
        kick:  { type: "array", items: { type: "integer" } },
        clap:  { type: "array", items: { type: "integer" } },
        snare: { type: "array", items: { type: "integer" } },
        hat:   { type: "array", items: { type: "integer" } },
        ohat:  { type: "array", items: { type: "integer" } },
      },
      required: ["kick", "clap", "snare", "hat", "ohat"],
      additionalProperties: false,
    },
    bass: {
      type: "array",
      description: "Bassline: je Eintrag ein Step (0-15) mit Notennamen",
      items: {
        type: "object",
        properties: {
          step: { type: "integer" },
          note: { type: "string", enum: BASS_NOTE_NAMES },
        },
        required: ["step", "note"],
        additionalProperties: false,
      },
    },
    notes: { type: "string", description: "Kurze Erklärung des Patterns (1-2 Sätze, Deutsch)" },
  },
  required: ["bpm", "drums", "bass", "notes"],
  additionalProperties: false,
};

const SYSTEM = `Du bist ein erfahrener Techno-Produzent und steuerst einen 16-Step-Sequencer (ein Takt, 16tel-Raster, Steps 0-15).
Erzeuge treibende, tanzbare Techno-Patterns.
Faustregeln:
- Kick meist "four on the floor" (Steps 0,4,8,12).
- Clap/Snare oft auf Step 4 und 12 (Backbeat).
- Hi-Hats gern auf Offbeats (2,6,10,14) für Groove.
- Open Hats sparsam einsetzen.
- Basslinie monophon und hypnotisch, meist auf Offbeats, passend zur Kick.
Verfügbare Bass-Noten: ${BASS_NOTE_NAMES.join(", ")} (C-Moll).
Antworte ausschließlich im vorgegebenen JSON-Format.`;

export class AIComposer {
  constructor() {
    this.apiKey = localStorage.getItem(KEY_STORAGE) || "";
  }

  get hasKey() { return !!this.apiKey; }

  setKey(key) {
    this.apiKey = (key || "").trim();
    if (this.apiKey) localStorage.setItem(KEY_STORAGE, this.apiKey);
    else localStorage.removeItem(KEY_STORAGE);
  }

  /**
   * Lässt Claude ein Pattern erzeugen.
   * @param {string} prompt  Wunsch des Nutzers, z.B. "düsterer, harter Warehouse-Techno"
   * @returns {Promise<object>} { bpm, drums:{...}, bass:[{step,note}], notes }
   */
  async generate(prompt) {
    if (!this.apiKey) throw new Error("Kein API-Schlüssel hinterlegt.");

    const res = await fetch(API_URL, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": this.apiKey,
        "anthropic-version": "2023-06-01",
        "anthropic-dangerous-direct-browser-access": "true",
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 1500,
        system: SYSTEM,
        output_config: { format: { type: "json_schema", schema: SCHEMA } },
        messages: [{
          role: "user",
          content: `Erzeuge ein komplettes Techno-Pattern für: "${prompt || "treibender Peak-Time-Techno"}".`,
        }],
      }),
    });

    if (!res.ok) {
      let detail = "";
      try { detail = (await res.json()).error?.message || ""; } catch (e) { /* ignore */ }
      if (res.status === 401) throw new Error("API-Schlüssel ungültig (401).");
      throw new Error(`API-Fehler ${res.status}. ${detail}`);
    }

    const data = await res.json();
    if (data.stop_reason === "refusal") {
      throw new Error("Anfrage wurde abgelehnt. Bitte anders formulieren.");
    }
    const textBlock = (data.content || []).find((b) => b.type === "text");
    if (!textBlock) throw new Error("Keine Antwort erhalten.");
    return JSON.parse(textBlock.text);
  }
}
