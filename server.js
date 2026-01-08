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

const app = express();
app.use(cors());

// --- REAL TIME SYNC ---
let lastReal = Date.now();

// pokud v state.json chybí time, dorobíme
if (!state.time) state.time = {};
state.time.now = Date.now();

// hlavní smyčka: sim čas = reálný čas
setInterval(() => {
  const now = Date.now();
  const dtMs = now - lastReal;
  lastReal = now;

  state.time.now = now;      // ✅ sim čas = realita
  tick(state, dtMs);         // dtMs pro případné budoucí modely
}, 1000);

app.get("/health", (req, res) => {
  res.json({
    ok: true,
    now: Date.now(),
    version: "B 3.8 (real-time sync)"
  });
});

app.get("/state", (req, res) => {
  res.json(state);
});

const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log("EIRA B 3.8 běží (real-time synced)");
});
