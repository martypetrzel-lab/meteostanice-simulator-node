// memory.js
// kompatibilní vrstva pro brain.js + ukládání grafových řad
// - drží "today" time-series (temperature/energyIn/energyOut/light/brainRisk)
// - drží "days" historii
// - přidává rememberExperience(), aby brain.js nespadl

const TZ = "Europe/Prague";
const MAX_DAYS = 30;
const MAX_EXPERIENCES = 500;

function todayKeyPrague(ts) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date(ts));

  const get = (type) => parts.find((p) => p.type === type)?.value;
  return `${get("year")}-${get("month")}-${get("day")}`;
}

function timeLabelPrague(ts) {
  try {
    return new Intl.DateTimeFormat("cs-CZ", {
      timeZone: TZ,
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
    }).format(new Date(ts));
  } catch {
    return new Date(ts).toLocaleTimeString("cs-CZ", { hour12: false });
  }
}

function safeGet(obj, path, fallback = null) {
  try {
    return (
      path.split(".").reduce((a, k) => (a && a[k] !== undefined ? a[k] : undefined), obj) ??
      fallback
    );
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
  if (arr.length > maxPoints) arr.splice(0, arr.length - maxPoints);
}

export function initMemory(state) {
  if (!state.memory) state.memory = {};

  const key = todayKeyPrague(state.time?.now ?? Date.now());

  if (!state.memory.today || state.memory.today.key !== key) {
    state.memory.today = {
      key,
      temperature: [],
      light: [],
      brainRisk: [],
      energyIn: [],
      energyOut: [],
      totals: { energyInWh: 0, energyOutWh: 0 },
      _lastSampleTs: null,
    };
  }

  if (!Array.isArray(state.memory.days)) state.memory.days = [];
  if (!Array.isArray(state.memory.experiences)) state.memory.experiences = [];
}

function rolloverDayIfNeeded(state) {
  initMemory(state);

  const now = state.time?.now ?? Date.now();
  const nowKey = todayKeyPrague(now);

  if (state.memory.today.key !== nowKey) {
    state.memory.days.push({
      key: state.memory.today.key,
      temperature: state.memory.today.temperature,
      light: state.memory.today.light,
      brainRisk: state.memory.today.brainRisk,
      energyIn: state.memory.today.energyIn,
      energyOut: state.memory.today.energyOut,
      totals: state.memory.today.totals,
    });

    if (state.memory.days.length > MAX_DAYS) {
      state.memory.days.splice(0, state.memory.days.length - MAX_DAYS);
    }

    state.memory.today = {
      key: nowKey,
      temperature: [],
      light: [],
      brainRisk: [],
      energyIn: [],
      energyOut: [],
      totals: { energyInWh: 0, energyOutWh: 0 },
      _lastSampleTs: null,
    };
  }
}

/**
 * brain.js kompatibilita:
 * brain importuje rememberExperience() -> musíme exportovat.
 */
export function rememberExperience(state, a, b) {
  initMemory(state);

  const now = state.time?.now ?? Date.now();

  let exp;
  if (typeof a === "string") {
    exp = { type: a, payload: b ?? null };
  } else {
    exp = a ?? {};
  }

  const record = {
    ts: now,
    t: timeLabelPrague(now),
    ...exp,
  };

  state.memory.experiences.push(record);

  if (state.memory.experiences.length > MAX_EXPERIENCES) {
    state.memory.experiences.splice(0, state.memory.experiences.length - MAX_EXPERIENCES);
  }
}

/**
 * memoryTick:
 * - sběr grafových bodů podle collectionIntervalSec (mozek / device.power)
 * - ukládá výkon (W) a integruje Wh do totals
 * - nově ukládá i světlo + trend rizika (pro grafy v UI)
 */
export function memoryTick(state, dtMs = 1000) {
  initMemory(state);
  rolloverDayIfNeeded(state);

  const now = state.time?.now ?? Date.now();
  const today = state.memory.today;

  const intervalSec = Math.max(1, num(safeGet(state, "device.power.collectionIntervalSec", 30), 30));
  const intervalMs = intervalSec * 1000;

  if (today._lastSampleTs && now - today._lastSampleTs < intervalMs) return;
  today._lastSampleTs = now;

  const tempC =
    num(safeGet(state, "world.environment.airTempC", NaN), NaN) ??
    num(safeGet(state, "device.temperature", NaN), NaN);

  if (Number.isFinite(tempC)) {
    pushPoint(today.temperature, { t: timeLabelPrague(now), v: Math.round(tempC * 100) / 100 }, 2500);
  }

  // světlo (lux)
  const lux = num(safeGet(state, "world.environment.light", NaN), NaN);
  if (Number.isFinite(lux)) {
    pushPoint(today.light, { t: timeLabelPrague(now), v: Math.round(lux) }, 2500);
  }

  // trend rizika (0-100)
  const risk = num(safeGet(state, "brain.risk", NaN), NaN);
  if (Number.isFinite(risk)) {
    pushPoint(today.brainRisk, { t: timeLabelPrague(now), v: Math.round(risk * 10) / 10 }, 2500);
  }

  const solarInW = num(safeGet(state, "device.power.solarInW", 0), 0);
  const loadW = num(safeGet(state, "device.power.loadW", 0), 0);

  // Preferujeme přesnější integraci z T 3.33.0 (energy.js).
  const whInToday = num(safeGet(state, "energy.totals.wh_in_today", NaN), NaN);
  const whOutToday = num(safeGet(state, "energy.totals.wh_out_today", NaN), NaN);
  if (Number.isFinite(whInToday) && Number.isFinite(whOutToday)) {
    today.totals.energyInWh = whInToday;
    today.totals.energyOutWh = whOutToday;
  } else {
    // fallback (starší model)
    const inWh = solarInW * (intervalSec / 3600);
    const outWh = loadW * (intervalSec / 3600);
    today.totals.energyInWh += inWh;
    today.totals.energyOutWh += outWh;
  }

  // W grafy: preferujeme INA p_raw (T 3.33.0), fallback na device.power.
  const pInW = num(safeGet(state, "energy.ina_in.p_raw", NaN), NaN);
  const pOutW = num(safeGet(state, "energy.ina_out.p_raw", NaN), NaN);
  pushPoint(today.energyIn, {
    t: timeLabelPrague(now),
    v: Math.round((Number.isFinite(pInW) ? pInW : solarInW) * 1000) / 1000,
  }, 2500);
  pushPoint(today.energyOut, {
    t: timeLabelPrague(now),
    v: Math.round((Number.isFinite(pOutW) ? pOutW : loadW) * 1000) / 1000,
  }, 2500);
}
