// memory.js (B 3.12)
// - zapisuje průběžně časové řady pro grafy (temperature / energyIn / energyOut)
// - počítá denní součty Wh
// - denní klíč podle Europe/Prague (aby "dnes" sedělo)

const TZ = "Europe/Prague";

// Kolik dní historie držet v paměti (aby /state nerostl do nekonečna)
const MAX_DAYS = 30;

/** YYYY-MM-DD podle Europe/Prague */
function todayKeyPrague(ts) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(new Date(ts));

  const get = (type) => parts.find(p => p.type === type)?.value;
  const y = get("year");
  const m = get("month");
  const d = get("day");
  return `${y}-${m}-${d}`;
}

function timeLabelPrague(ts) {
  try {
    // HH:MM:SS v Praze
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

  if (!state.memory.today || state.memory.today.key !== key) {
    // pokud je to první start, nebo reset klíče, inicializujeme
    state.memory.today = {
      key,
      temperature: [],
      energyIn: [],
      energyOut: [],
      totals: { energyInWh: 0, energyOutWh: 0 },
      _lastSampleTs: null
    };
  }

  if (!Array.isArray(state.memory.days)) {
    state.memory.days = [];
  }
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

    // limit historie
    if (state.memory.days.length > MAX_DAYS) {
      state.memory.days.splice(0, state.memory.days.length - MAX_DAYS);
    }

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
 * - dtMs je volitelný (nepovinný); hlavní je state.time.now
 */
export function memoryTick(state, dtMs = 1000) {
  initMemory(state);
  rolloverDayIfNeeded(state);

  const now = state.time?.now ?? Date.now();
  const today = state.memory.today;

  // interval sběru dat rozhoduje mozek (fallback 30s)
  const intervalSec = Math.max(1, num(safeGet(state, "device.power.collectionIntervalSec", 30), 30));
  const intervalMs = intervalSec * 1000;

  // ulož jen pokud uběhl interval
  if (today._lastSampleTs && now - today._lastSampleTs < intervalMs) return;
  today._lastSampleTs = now;

  // teplota: preferujeme world.environment.airTempC, fallback device.temperature
  const tempC =
    num(safeGet(state, "world.environment.airTempC", NaN), NaN) ??
    num(safeGet(state, "device.temperature", NaN), NaN);

  if (Number.isFinite(tempC)) {
    pushPoint(today.temperature, { t: timeLabelPrague(now), v: Math.round(tempC * 100) / 100 }, 2500);
  }

  // energie: W -> Wh přírůstky přes interval
  const solarInW = num(safeGet(state, "device.power.solarInW", 0), 0);
  const loadW = num(safeGet(state, "device.power.loadW", 0), 0);

  // Wh za interval
  const inWh = solarInW * (intervalSec / 3600);
  const outWh = loadW * (intervalSec / 3600);

  today.totals.energyInWh += inWh;
  today.totals.energyOutWh += outWh;

  // grafy si drží průběh výkonu (W) v čase
  pushPoint(today.energyIn, { t: timeLabelPrague(now), v: Math.round(solarInW * 1000) / 1000 }, 2500);
  pushPoint(today.energyOut, { t: timeLabelPrague(now), v: Math.round(loadW * 1000) / 1000 }, 2500);
}
