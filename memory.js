import { createMemoryRoot } from "./memorySchema.js";

function todayKey(ts) {
  return new Date(ts).toISOString().slice(0, 10);
}

function weekKey(ts) {
  // ISO-like week key: YYYY-Www (approx)
  const d = new Date(ts);
  const date = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const dayNum = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil((((date - yearStart) / 86400000) + 1) / 7);
  const yyyy = date.getUTCFullYear();
  const ww = String(weekNo).padStart(2, "0");
  return `${yyyy}-W${ww}`;
}

function hhmmss(ts) {
  return new Date(ts).toISOString().slice(11, 19);
}

function clamp(v, a, b) {
  return Math.max(a, Math.min(b, v));
}

// B 3.11: adaptive sampling interval
function computeSamplingIntervalMs(state) {
  const socPct = Math.round((state.device?.battery?.soc ?? 0) * 100);
  const isDay = !!state.time?.isDay;

  // "learning" -> conservatism multiplier (>=1 means slower sampling)
  const conserv = clamp(state.meta?.conservatism ?? 1, 1, 2);

  let base;
  if (isDay && socPct >= 70) base = 10_000;
  else if (isDay && socPct >= 35) base = 30_000;
  else if (isDay) base = 90_000;
  else if (!isDay && socPct >= 70) base = 60_000;
  else if (!isDay && socPct >= 35) base = 180_000;
  else base = 600_000;

  return Math.round(base * conserv);
}

function ensureWeekBucket(state, wk) {
  if (!state.memory.weeks) state.memory.weeks = [];

  let bucket = state.memory.weeks.find(w => w.key === wk);
  if (!bucket) {
    bucket = {
      key: wk,
      minT: null,
      maxT: null,
      avgT: null,
      samples: 0,
      sumT: 0,
      energyInWh: 0,
      energyOutWh: 0
    };
    state.memory.weeks.push(bucket);
  }

  // keep last 12 weeks
  if (state.memory.weeks.length > 12) {
    state.memory.weeks = state.memory.weeks.slice(-12);
  }

  return bucket;
}

function recomputeDayStats(dayObj) {
  const temps = dayObj.temperature || [];
  if (!temps.length) {
    dayObj.stats = { minT: null, maxT: null, avgT: null };
    return;
  }

  let minT = temps[0].v;
  let maxT = temps[0].v;
  let sum = 0;

  for (const p of temps) {
    const v = p.v;
    if (v < minT) minT = v;
    if (v > maxT) maxT = v;
    sum += v;
  }

  const avgT = sum / temps.length;
  dayObj.stats = {
    minT: Number(minT.toFixed(2)),
    maxT: Number(maxT.toFixed(2)),
    avgT: Number(avgT.toFixed(2))
  };
}

export function initMemory(state) {
  if (!state.memory) {
    state.memory = createMemoryRoot();
  } else {
    // backfill missing fields
    if (!state.memory.today) state.memory.today = createMemoryRoot().today;
    if (!state.memory.days) state.memory.days = [];
    if (!state.memory.weeks) state.memory.weeks = [];
    if (!state.memory.experiences) state.memory.experiences = {};
    if (!state.memory.experienceCounters) state.memory.experienceCounters = {};
  }

  if (!state.meta) state.meta = {};
  if (!state.meta.lastSampleAt) state.meta.lastSampleAt = 0;

  if (!state.memory.today.key) {
    state.memory.today.key = todayKey(state.time.now);
  }

  if (!state.memory.today.totals) {
    state.memory.today.totals = { energyInWh: 0, energyOutWh: 0 };
  }

  if (!state.memory.today.stats) {
    state.memory.today.stats = { minT: null, maxT: null, avgT: null };
  }
}

export function memoryTick(state) {
  initMemory(state);

  const nowKey = todayKey(state.time.now);

  // accumulate energy totals every second (independent of sampling)
  const solarInW = state.device?.power?.solarInW ?? 0;
  const loadW = state.device?.power?.loadW ?? 0;
  state.memory.today.totals.energyInWh = Number((state.memory.today.totals.energyInWh + solarInW / 3600).toFixed(6));
  state.memory.today.totals.energyOutWh = Number((state.memory.today.totals.energyOutWh + loadW / 3600).toFixed(6));

  // day rollover
  if (state.memory.today.key !== nowKey) {
    // finalize day stats
    recomputeDayStats(state.memory.today);

    // push day snapshot
    state.memory.days.push(JSON.parse(JSON.stringify(state.memory.today)));
    if (state.memory.days.length > 21) state.memory.days = state.memory.days.slice(-21);

    // start new day
    state.memory.today = {
      key: nowKey,
      temperature: [],
      energyIn: [],
      energyOut: [],
      totals: { energyInWh: 0, energyOutWh: 0 },
      stats: { minT: null, maxT: null, avgT: null }
    };
  }

  // adaptive sampling
  const interval = computeSamplingIntervalMs(state);
  if (state.time.now - state.meta.lastSampleAt < interval) return;

  const stamp = hhmmss(state.time.now);
  const t = state.device?.temperature ?? state.world?.environment?.temperature ?? null;

  if (t !== null) state.memory.today.temperature.push({ t: stamp, v: Number(t.toFixed(2)) });
  state.memory.today.energyIn.push({ t: stamp, v: Number((state.device?.power?.solarInW ?? 0).toFixed(3)) });
  state.memory.today.energyOut.push({ t: stamp, v: Number((state.device?.power?.loadW ?? 0).toFixed(3)) });

  // cap sizes
  const cap = 2000;
  if (state.memory.today.temperature.length > cap) state.memory.today.temperature = state.memory.today.temperature.slice(-cap);
  if (state.memory.today.energyIn.length > cap) state.memory.today.energyIn = state.memory.today.energyIn.slice(-cap);
  if (state.memory.today.energyOut.length > cap) state.memory.today.energyOut = state.memory.today.energyOut.slice(-cap);

  // update week aggregation (B 3.12)
  const wk = weekKey(state.time.now);
  const w = ensureWeekBucket(state, wk);

  if (t !== null) {
    w.samples += 1;
    w.sumT += t;
    w.minT = w.minT === null ? t : Math.min(w.minT, t);
    w.maxT = w.maxT === null ? t : Math.max(w.maxT, t);
    w.avgT = w.sumT / w.samples;
  }

  w.energyInWh = Number((w.energyInWh + (state.device?.power?.solarInW ?? 0) / 3600).toFixed(6));
  w.energyOutWh = Number((w.energyOutWh + (state.device?.power?.loadW ?? 0) / 3600).toFixed(6));

  state.meta.lastSampleAt = state.time.now;
}

export function rememberExperience(state, type, data = {}) {
  initMemory(state);

  // store events list (bounded)
  if (!state.memory.experiences[type]) state.memory.experiences[type] = [];
  state.memory.experiences[type].push({ time: state.time.now, ...data });
  if (state.memory.experiences[type].length > 200) {
    state.memory.experiences[type] = state.memory.experiences[type].slice(-200);
  }

  // counters (B 3.13)
  if (!state.memory.experienceCounters[type]) state.memory.experienceCounters[type] = 0;
  state.memory.experienceCounters[type] += 1;

  state.meta.lastExperience = type;
  state.meta.learned = true;
}
