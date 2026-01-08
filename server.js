import express from "express";
import cors from "cors";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

import { tick } from "./simulator.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// B 3.10: persistent storage on Railway Volume
// - default mount: /data
// - can override by env STATE_DIR or STATE_PATH
const STATE_DIR = process.env.STATE_DIR || "/data";
const FALLBACK_STATE_PATH = path.join(__dirname, "state.json");
const PERSIST_STATE_PATH = process.env.STATE_PATH || path.join(STATE_DIR, "state.json");

function canUsePersistentPath() {
  try {
    if (!fs.existsSync(STATE_DIR)) return false;
    const testFile = path.join(STATE_DIR, ".write-test");
    fs.writeFileSync(testFile, "ok", "utf-8");
    fs.unlinkSync(testFile);
    return true;
  } catch {
    return false;
  }
}

const usePersistent = canUsePersistentPath();
const statePath = usePersistent ? PERSIST_STATE_PATH : FALLBACK_STATE_PATH;

function loadStateSafe() {
  try {
    return JSON.parse(fs.readFileSync(statePath, "utf-8"));
  } catch {
    // minimal boot state
    return {
      time: { now: Date.now(), isDay: true }
    };
  }
}

let state = loadStateSafe();

// autosave (debounced)
let saveTimer = null;
let lastSavedAt = 0;

function saveNow() {
  try {
    fs.writeFileSync(statePath, JSON.stringify(state, null, 2), "utf-8");
    lastSavedAt = Date.now();
  } catch (e) {
    console.error("Save failed:", e?.message || e);
  }
}

function scheduleSave() {
  const now = Date.now();
  if (now - lastSavedAt < 1500) return; // at most ~1.5s
  if (saveTimer) return;

  saveTimer = setTimeout(() => {
    saveTimer = null;
    saveNow();
  }, 250);
}

const app = express();
app.use(cors());

setInterval(() => {
  if (!state.time) state.time = { now: Date.now(), isDay: true };
  state.time.now += 1000;

  tick(state);

  scheduleSave();
}, 1000);

app.get("/state", (req, res) => res.json(state));
app.get("/health", (req, res) => {
  res.json({
    ok: true,
    version: "B 3.14",
    persistent: usePersistent,
    statePath,
    now: state?.time?.now ?? null
  });
});

const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log(`EIRA B 3.14 běží (Railway ready) | persistent=${usePersistent} | ${statePath}`);
});

process.on("SIGTERM", () => {
  try { saveNow(); } catch {}
  process.exit(0);
});
process.on("SIGINT", () => {
  try { saveNow(); } catch {}
  process.exit(0);
});
