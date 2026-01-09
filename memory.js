// memory.js (B 3.12)
// - zapisuje průběžně časové řady pro grafy (temperature / energyIn / energyOut)
// - počítá denní součty Wh
// - denní klíč podle Europe/Prague (aby "dnes" sedělo)

const TZ = "Europe/Prague";

/** YYYY-MM-DD podle Europe/Prague */
function todayKeyPrague(ts) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(new Date(ts));

  const map = {};
  for (const p of parts) {
    if (p.type !== "literal") map[p.type] = p.value;
  }

  return `${map.year}-${map.month}-${map.day}`;
}

/** HH:MM:SS podle Europe/Prague */
function timeLabelPrague(ts) {
  try {
    return new Intl.DateTimeFormat("cs-CZ", {
      timeZone: TZ,
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false
    }).format(new Date(ts));
  } catch {
    return new Date(ts).toLocaleTimeString("cs-CZ", { hour12: false });
  }
}

function safeGet(obj, path, fallback = null) {
  try {
    return path.split(".").reduce((a, k) => (a && a[k] !== undefined ? a[k] : undefined), obj) ?? fallback;
  } catch {
    return fallback;
  }
}

function num(x, fallback = 0) {
  const n = Number(x);
  return Number.isFinite(n) ? n : fallback;
}

function pushPoint(arr, point, maxPoints = 2500) {
  arr.push(point);
  if (arr.length > maxPoints) {
    // jednoduchý limit: drž posledních maxPoints bodů
    arr.splice(0, arr.length - maxPoints);
  }
}

export function initMemory(state) {
  if (!state.memory) state.memory = {};

  const key = todayKeyPrague(state.time?.now ?? Date.now());

  if (!state.memory.today) {
    state.memory.today = {
      key,
      temperature: [],
      energyIn: [],
      energyOut: [],
      totals: { energyInWh: 0, energyOutWh: 0 },
      _lastSampleTs: null
    };
  }

  if (!state.memory.today.totals) {
    state.memory.today.totals = { energyInWh: 0, energyOutWh: 0 };
  }

  if (state.memory.today._lastSampleTs === undefined) {
    state.memory.today._lastSampleTs = null;
  }

  if (!state.memory.days) state.memory.days = [];
  if (!state.memory.experiences) state.memory.experiences = {};
  if (!state.meta) state.meta = {};
}

function rolloverDayIfNeeded(state) {
  initMemory(state);

  const now = state.time?.now ?? Date.now();
  const nowKey = todayKeyPrague(now);

  if (state.memory.today.key !== nowKey) {
    // uložíme den do historie
    state.memory.days.push({
      key: state.memory.today.key,
      temperature: state.memory.today.temperature,
      energyIn: state.memory.today.energyIn,
      energyOut: state.memory.today.energyOut,
      totals: state.memory.today.totals
    });

    // a začneme nový den
    state.memory.today = {
      key: nowKey,
      temperature: [],
      energyIn: [],
      energyOut: [],
      totals: { energyInWh: 0, energyOutWh: 0 },
      _lastSampleTs: null
    };
  }
}

/**
 * memoryTick
 * - loguje vzorky pro grafy podle collectionIntervalSec (mozek)
 * - dtMs je volitelný (nepovinný); hlavní je reálný čas v state.time.now
 */
export function memoryTick(state, dtMs = 1000) {
  rolloverDayIfNeeded(state);

  const now = state.time?.now ?? Date.now();
  const intervalSec = Math.max(1, Math.round(num(safeGet(state, "device.collectionIntervalSec", 10), 10)));
  const intervalMs = intervalSec * 1000;

  const lastTs = state.memory.today._lastSampleTs;

  // ještě nemáme první vzorek -> udělej okamžitě
  const shouldSample = (lastTs === null) || (now - lastTs >= intervalMs);

  if (!shouldSample) return;

  const label = timeLabelPrague(now);

  // zdroje dat (robustní cesty)
  const tempC = num(
    safeGet(state, "world.environment.temperature",
      safeGet(state, "environment.temperature",
        safeGet(state, "device.temperature", 0)
      )
    ),
    0
  );

  const solarW = num(
    safeGet(state, "device.solarInW",
      safeGet(state, "device.power.solarInW", 0)
    ),
    0
  );

  const loadW = num(
    safeGet(state, "device.loadW",
      safeGet(state, "device.power.loadW", 0)
    ),
    0
  );

  // === záznam bodů pro grafy ===
  pushPoint(state.memory.today.temperature, { t: label, v: tempC });
  pushPoint(state.memory.today.energyIn, { t: label, v: solarW });
  pushPoint(state.memory.today.energyOut, { t: label, v: loadW });

  // === výpočet Wh (integrace výkonu mezi vzorky) ===
  if (lastTs !== null) {
    const dHours = (now - lastTs) / (1000 * 60 * 60);
    // jednoduchý obdélník (stačí pro simulátor)
    state.memory.today.totals.energyInWh += solarW * dHours;
    state.memory.today.totals.energyOutWh += loadW * dHours;
  }

  state.memory.today._lastSampleTs = now;
}

export function rememberExperience(state, type, data = {}) {
  initMemory(state);

  if (!state.memory.experiences[type]) {
    state.memory.experiences[type] = [];
  }

  state.memory.experiences[type].push({
    time: state.time?.now ?? Date.now(),
    ...data
  });

  state.meta.lastExperience = type;
  state.meta.learned = true;
}
