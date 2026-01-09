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
  res.json(state);
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
