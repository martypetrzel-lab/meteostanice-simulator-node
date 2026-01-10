// server.js
import express from "express";
import cors from "cors";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

import { tick } from "./simulator.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// bezpečné načtení state.json
const statePath = path.join(__dirname, "state.json");
const state = JSON.parse(fs.readFileSync(statePath, "utf-8"));

// Vrátí zmenšený state pro UI (nižší payload)
function compactState(state) {
  // shallow copy top-level
  const out = {
    time: state.time,
    world: state.world,
    device: state.device,
    memory: state.memory,
    message: state.message
  };

  // omez body v `today` (už je limitované v memory.js, ale UI někdy chce ještě méně)
  const maxTodayPoints = 1440; // cca 24h při 1/min
  const t = out.memory?.today;
  if (t) {
    const cap = (arr) =>
      (Array.isArray(arr) && arr.length > maxTodayPoints)
        ? arr.slice(-maxTodayPoints)
        : arr;

    t.temperature = cap(t.temperature);
    t.energyIn = cap(t.energyIn);
    t.energyOut = cap(t.energyOut);
  }
  return out;
}

const app = express();
app.use(cors());

// --- REAL TIME CLOCK ---
// držíme sim čas = reálný čas, ale zachováme state strukturu
let lastReal = Date.now();
if (!state.time) state.time = {};
state.time.now = Date.now();

setInterval(() => {
  const now = Date.now();
  const dtMs = now - lastReal;
  lastReal = now;

  // sim čas = real time
  state.time.now = now;

  // tick dostane dt (užitečné pro integrace)
  tick(state, dtMs);
}, 1000);

app.get("/state", (req, res) => {
  // Basic cache control: vždy fresh
  res.setHeader("Cache-Control", "no-store");

  const compact = String(req.query.compact || "").toLowerCase();
  if (compact === "1" || compact === "true" || compact === "yes") {
    return res.json(compactState(state));
  }
  return res.json(state);
});

// volitelný health endpoint (hodí se pro UI test)
app.get("/health", (req, res) => {
  res.json({
    ok: true,
    version: "B3.16-world",
    now: Date.now()
  });
});

const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log("EIRA B3.16-world běží (real time + 21-day cycle world)");
});
