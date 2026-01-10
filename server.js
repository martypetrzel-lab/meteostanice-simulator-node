// B 3.28 — oprava dne dle Europe/Prague (půlnoc), aby grafy seděly na reálný čas
// - dayKey počítáme přes Intl v Europe/Prague (NE přes toISOString UTC)
// - při změně dne: rollover memory.today -> memory.days + založení nového today
// - logování časů (t) je HH:MM:SS v Europe/Prague

import express from "express";
import path from "path";
import { fileURLToPath } from "url";

import { tickBrain } from "./brain.js"; // očekává objekt state, vrací (nebo mutuje) state

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(express.json());

// ✅ FIX: neotravuj konzoli 404 pro favicon
app.get("/favicon.ico", (req, res) => {
  res.status(204).end();
});

// ====== TIME HELPERS (Europe/Prague) ======
const TZ = "Europe/Prague";

function getPragueParts(ms) {
  // robustně vytáhne YYYY-MM-DD + HH:MM:SS v Europe/Prague
  const dtf = new Intl.DateTimeFormat("en-GB", {
    timeZone: TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });

  // formatToParts je nejbezpečnější
  const parts = dtf.formatToParts(new Date(ms));
  const map = Object.fromEntries(parts.map((p) => [p.type, p.value]));

  const y = map.year;
  const m = map.month;
  const d = map.day;
  const hh = map.hour;
  const mm = map.minute;
  const ss = map.second;

  return {
    dayKey: `${y}-${m}-${d}`,
    hms: `${hh}:${mm}:${ss}`,
    hm: `${hh}:${mm}`,
    hour: Number(hh),
  };
}

// ====== STATE ======
const state = {
  time: {
    now: Date.now(), // ms epoch (sim/real sync)
    isDay: true,
  },
  world: {
    environment: {
      temperature: 15,
      light: 300,
    },
    time: {
      now: Date.now(),
      isDay: true,
    },
  },
  device: {
    temperature: 15,
    humidity: 50,
    light: 300,
    battery: null,
    power: {
      solarInW: 0,
      loadW: 0,
      balanceWh: 0,
    },
    fan: false,
  },
  memory: {
    today: {
      key: getPragueParts(Date.now()).dayKey,
      temperature: [],
      energyIn: [],
      energyOut: [],
    },
    days: [],
  },
};

// ====== MEMORY ROLLOVER ======
function ensureTodayRoll(stateObj) {
  const nowMs = stateObj.time?.now ?? Date.now();
  const { dayKey } = getPragueParts(nowMs);

  if (!stateObj.memory) stateObj.memory = {};
  if (!stateObj.memory.today) {
    stateObj.memory.today = { key: dayKey, temperature: [], energyIn: [], energyOut: [] };
    if (!stateObj.memory.days) stateObj.memory.days = [];
    return;
  }

  const currentKey = stateObj.memory.today.key;
  if (currentKey !== dayKey) {
    // ulož včerejšek do days (max třeba 30 dní)
    stateObj.memory.days = stateObj.memory.days || [];
    stateObj.memory.days.unshift(stateObj.memory.today);

    // omez velikost historie
    const MAX_DAYS = 60;
    if (stateObj.memory.days.length > MAX_DAYS) stateObj.memory.days.length = MAX_DAYS;

    // založ nový dnešní den
    stateObj.memory.today = {
      key: dayKey,
      temperature: [],
      energyIn: [],
      energyOut: [],
    };
  }
}

// ====== LOGGING HELPERS ======
function pushPoint(arr, point, maxLen = 2000) {
  arr.push(point);
  if (arr.length > maxLen) arr.splice(0, arr.length - maxLen);
}

function logTelemetry(stateObj) {
  const nowMs = stateObj.time?.now ?? Date.now();
  const { hms } = getPragueParts(nowMs);

  // teplota
  if (typeof stateObj.device?.temperature === "number") {
    pushPoint(stateObj.memory.today.temperature, { t: hms, v: Number(stateObj.device.temperature.toFixed(2)) }, 3000);
  }

  // energie in/out (pokud existuje)
  const solarW = stateObj.device?.power?.solarInW;
  const loadW = stateObj.device?.power?.loadW;

  if (typeof solarW === "number") {
    pushPoint(stateObj.memory.today.energyIn, { t: hms, v: Number(solarW.toFixed(3)) }, 3000);
  }
  if (typeof loadW === "number") {
    pushPoint(stateObj.memory.today.energyOut, { t: hms, v: Number(loadW.toFixed(3)) }, 3000);
  }
}

// ====== MAIN LOOP ======
const TICK_MS = 5000;

setInterval(() => {
  // reálný sync (B 3.28): držíme state.time.now = Date.now()
  state.time.now = Date.now();
  state.world.time.now = state.time.now;

  // nastav den/noc (jednoduše podle hodiny v Praze)
  const { hour } = getPragueParts(state.time.now);
  const isDay = hour >= 7 && hour < 19;
  state.time.isDay = isDay;
  state.world.time.isDay = isDay;

  ensureTodayRoll(state);

  // rozhodování mozku (pokud je)
  try {
    tickBrain(state);
  } catch (e) {
    // nechceme shodit server
    console.error("[brain] tick error:", e?.message || e);
  }

  // logy do grafů
  logTelemetry(state);
}, TICK_MS);

// ====== API ======
app.get("/state", (req, res) => {
  res.json(state);
});

// ====== STATIC ======
app.use("/", express.static(path.join(__dirname, "public")));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`[ok] server listening on :${PORT}`));
