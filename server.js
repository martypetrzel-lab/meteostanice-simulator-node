// server.js
import express from "express";
import cors from "cors";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

import { tick } from "./simulator.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ---- STATE LOAD ----
const statePath = path.join(__dirname, "state.json");
const state = JSON.parse(fs.readFileSync(statePath, "utf-8"));

// ---- CORS (IMPORTANT) ----
// Povolené originy (GitHub Pages + lokál + případně tvůj railway front, pokud ho máš)
const ALLOWED_ORIGINS = new Set([
  "https://martypetrzel-lab.github.io",
  "http://localhost:3000",
  "http://127.0.0.1:3000",
  "http://localhost:5173",
  "http://127.0.0.1:5173",
]);

// Pokud chceš povolit *cokoliv* (public API), můžeš to přepnout na true
const ALLOW_ANY_ORIGIN = true;

const corsOptions = {
  origin: (origin, cb) => {
    // některé requesty (např. curl, server-to-server) nemají Origin
    if (!origin) return cb(null, true);

    if (ALLOW_ANY_ORIGIN) return cb(null, true);

    if (ALLOWED_ORIGINS.has(origin)) return cb(null, true);

    return cb(new Error(`CORS blocked origin: ${origin}`), false);
  },
  methods: ["GET", "POST", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
  credentials: false,
  maxAge: 86400,
};

// ---- APP ----
const app = express();

// ✅ CORS musí být úplně nahoře, před routes
app.use(cors(corsOptions));
// ✅ preflight pro všechny cesty
app.options("*", cors(corsOptions));

// Cache-control: žádný cache (aby se to nechovalo divně při refreshi)
app.use((req, res, next) => {
  res.setHeader("Cache-Control", "no-store");
  next();
});

// ---- REAL TIME CLOCK ----
let lastReal = Date.now();
if (!state.time) state.time = {};
state.time.now = Date.now();

setInterval(() => {
  const now = Date.now();
  const dtMs = now - lastReal;
  lastReal = now;

  // sim čas = reálný
  state.time.now = now;

  tick(state, dtMs);
}, 1000);

// ---- STATE ----
app.get("/state", (req, res) => {
  res.json(state);
});

// jednoduchý health endpoint
app.get("/health", (req, res) => {
  res.json({ ok: true, now: Date.now() });
});

const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log(`Meteostanice backend běží na portu ${port}`);
});
