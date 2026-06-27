// storage.js
// Speichert/lädt Songs – im Browser (localStorage) und als JSON-Datei.

const INDEX_KEY = "techno_studio_songs";

function readIndex() {
  try { return JSON.parse(localStorage.getItem(INDEX_KEY)) || {}; }
  catch (e) { return {}; }
}
function writeIndex(idx) {
  localStorage.setItem(INDEX_KEY, JSON.stringify(idx));
}

/** Namen aller im Browser gespeicherten Songs. */
export function listSongs() {
  return Object.keys(readIndex()).sort();
}

export function saveSong(name, state) {
  const idx = readIndex();
  idx[name] = { savedAt: new Date().toISOString(), state };
  writeIndex(idx);
}

export function loadSong(name) {
  const idx = readIndex();
  return idx[name] ? idx[name].state : null;
}

export function deleteSong(name) {
  const idx = readIndex();
  delete idx[name];
  writeIndex(idx);
}

/** Song als .json-Datei herunterladen. */
export function downloadSong(name, state) {
  const blob = new Blob([JSON.stringify({ name, state }, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = (name || "techno-song").replace(/[^\w.-]+/g, "_") + ".json";
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

/** .json-Datei einlesen -> { name, state }. */
export function readSongFile(file) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => {
      try {
        const obj = JSON.parse(r.result);
        if (!obj.state) throw new Error("Ungültige Song-Datei.");
        resolve(obj);
      } catch (e) { reject(e); }
    };
    r.onerror = () => reject(new Error("Datei konnte nicht gelesen werden."));
    r.readAsText(file);
  });
}
