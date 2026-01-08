import express from "express";
import cors from "cors";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

import { tick } from "./simulator.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const statePath = path.join(__dirname, "state.json");

// bezpečné načtení state.json
let state = {};
try {
  state = JSON.parse(fs.readFileSync(statePath, "utf-8"));
} catch {
  state = { time: { now: Date.now(), isDay: true } };
}

// --- autosave (debounce) ---
let saveTimer = null;
let lastSavedAt = 0;

function scheduleSave() {
  const now = Date.now();
  // nečastěji než 2s
  if (now - lastSavedAt < 2000) return;

  if (saveTimer) return;
  saveTimer = setTimeout(() => {
    saveTimer = null;
    try {
      fs.writeFileSync(statePath, JSON.stringify(state, null, 2), "utf-8");
      lastSavedAt = Date.now();
    } catch (e) {
      // Railway bez volume: může občas failnout – nepadáme
      console.error("Autosave failed:", e?.message || e);
    }
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

// healthcheck pro Railway
app.get("/health", (req, res) => {
  res.json({ ok: true, version: "B 3.9", now: state?.time?.now ?? null });
});

const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log("EIRA B 3.9 běží (Railway ready)");
});

// graceful shutdown
process.on("SIGTERM", () => {
  try {
    fs.writeFileSync(statePath, JSON.stringify(state, null, 2), "utf-8");
  } catch {}
  process.exit(0);
});
process.on("SIGINT", () => {
  try {
    fs.writeFileSync(statePath, JSON.stringify(state, null, 2), "utf-8");
  } catch {}
  process.exit(0);
});
