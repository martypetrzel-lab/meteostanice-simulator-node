// sim/world/worldSim.js
// T 3.31.0 – Svět & simulace (UZAVŘENO)
//
// Požadavky:
// - běží kontinuálně v čase (žádné skoky díky interním low-pass filtrům)
// - používá scénáře + stresové vzorce
// - skládá do 21denních cyklů: LEARNING / UNCERTAINTY / CRISIS
// - generuje vrstvy: denní rytmus + scénář + krátkodobá variabilita (plynulá)
// - svět NIKDY nereaguje na mozek a NEZNÁ baterii ani rozhodnutí

import { SCENARIOS } from "./scenarios.js";
import { STRESS_PATTERNS } from "./patterns.js";

const TZ = "Europe/Prague";
const CYCLE_DAYS = 21;

function clamp01(x) { return Math.max(0, Math.min(1, x)); }
function clamp(x, a, b) { return Math.max(a, Math.min(b, x)); }

// --- deterministic helpers ---
function hash32(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function mulberry32(seed) {
  let t = seed >>> 0;
  return () => {
    t += 0x6D2B79F5;
    let x = t;
    x = Math.imul(x ^ (x >>> 15), x | 1);
    x ^= x + Math.imul(x ^ (x >>> 7), x | 61);
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
}

function smoothstep01(x) {
  const t = clamp01(x);
  return t * t * (3 - 2 * t);
}

function lowpass(prev, target, dtSec, tauSec) {
  const a = 1 - Math.exp(-dtSec / Math.max(0.0001, tauSec));
  return prev + (target - prev) * a;
}

// --- Prague time parts (no external libs) ---
const dtfPrague = new Intl.DateTimeFormat("en-GB", {
  timeZone: TZ,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hourCycle: "h23"
});

function pragueParts(ts) {
  const parts = dtfPrague.formatToParts(new Date(ts));
  const o = {};
  for (const p of parts) {
    if (p.type !== "literal") o[p.type] = p.value;
  }
  return {
    y: Number(o.year),
    m: Number(o.month),
    d: Number(o.day),
    hh: Number(o.hour),
    mm: Number(o.minute),
    ss: Number(o.second)
  };
}

function dayOfYear(y, m, d) {
  const start = Date.UTC(y, 0, 1);
  const now = Date.UTC(y, m - 1, d);
  return Math.floor((now - start) / 86400000) + 1;
}

// jednoduchá aproximace délky dne pro střední Evropu (lat ~50°)
function dayLengthHoursApprox(doy, latDeg = 50.0755) {
  const lat = (latDeg * Math.PI) / 180;
  const decl = (23.44 * Math.PI / 180) * Math.sin((2 * Math.PI / 365) * (doy - 81));
  const cosH0 = clamp(-Math.tan(lat) * Math.tan(decl), -1, 1);
  const H0 = Math.acos(cosH0);
  return (2 * H0 * 24) / (2 * Math.PI);
}

function elevationFactor(nowTs, latDeg) {
  const p = pragueParts(nowTs);
  const hours = p.hh + p.mm / 60 + p.ss / 3600;
  const doy = dayOfYear(p.y, p.m, p.d);

  const dayLen = dayLengthHoursApprox(doy, latDeg);
  const sunriseHour = 12 - dayLen / 2;
  const sunsetHour = 12 + dayLen / 2;

  if (hours <= sunriseHour || hours >= sunsetHour) {
    return { elevF: 0, sunriseHour, sunsetHour, p, doy };
  }
  const t = (hours - sunriseHour) / Math.max(0.0001, (sunsetHour - sunriseHour));
  const elevF = Math.sin(Math.PI * t); // 0..1..0
  return { elevF: clamp01(elevF), sunriseHour, sunsetHour, p, doy };
}

function cyclePhase(dayIn21) {
  if (dayIn21 <= 7) return "LEARNING";
  if (dayIn21 <= 14) return "UNCERTAINTY";
  return "CRISIS";
}

function pickFromWeighted(rng, items) {
  let sum = 0;
  for (const it of items) sum += it.w;
  let r = rng() * sum;
  for (const it of items) {
    r -= it.w;
    if (r <= 0) return it.id;
  }
  return items[items.length - 1].id;
}

function weightsForPhase(phase) {
  if (phase === "LEARNING") {
    return {
      scenario: [
        { id: "STABLE_CLEAR", w: 3.2 },
        { id: "VARIABLE_CLOUDS", w: 2.6 },
        { id: "OVERCAST_BAD", w: 1.6 },
        { id: "UNSTABLE_FRONT", w: 1.2 },
        { id: "COLD_CLEAR", w: 0.9 },
        { id: "HEAT_WAVE", w: 0.8 }
      ],
      patternChance: 0.18
    };
  }
  if (phase === "UNCERTAINTY") {
    return {
      scenario: [
        { id: "STABLE_CLEAR", w: 2.2 },
        { id: "VARIABLE_CLOUDS", w: 3.0 },
        { id: "OVERCAST_BAD", w: 2.2 },
        { id: "UNSTABLE_FRONT", w: 2.2 },
        { id: "COLD_CLEAR", w: 1.0 },
        { id: "HEAT_WAVE", w: 1.0 }
      ],
      patternChance: 0.34
    };
  }
  return {
    scenario: [
      { id: "STABLE_CLEAR", w: 1.2 },
      { id: "VARIABLE_CLOUDS", w: 2.0 },
      { id: "OVERCAST_BAD", w: 3.0 },
      { id: "UNSTABLE_FRONT", w: 2.8 },
      { id: "COLD_CLEAR", w: 1.2 },
      { id: "HEAT_WAVE", w: 1.2 }
    ],
    patternChance: 0.55
  };
}

function choosePattern(rng, phase) {
  if (phase === "LEARNING") {
    return pickFromWeighted(rng, [
      { id: "FALSE_HOPE", w: 2.0 },
      { id: "SLOW_DRAIN", w: 1.3 },
      { id: "COLD_NIGHT", w: 1.2 },
      { id: "HOT_LOCK", w: 1.2 },
      { id: "LONG_GRAY", w: 1.0 },
      { id: "BROKEN_RHYTHM", w: 0.6 }
    ]);
  }
  if (phase === "UNCERTAINTY") {
    return pickFromWeighted(rng, [
      { id: "FALSE_HOPE", w: 2.2 },
      { id: "SLOW_DRAIN", w: 1.8 },
      { id: "LONG_GRAY", w: 1.6 },
      { id: "BROKEN_RHYTHM", w: 1.4 },
      { id: "COLD_NIGHT", w: 1.2 },
      { id: "HOT_LOCK", w: 1.0 }
    ]);
  }
  return pickFromWeighted(rng, [
    { id: "LONG_GRAY", w: 2.6 },
    { id: "SLOW_DRAIN", w: 2.2 },
    { id: "BROKEN_RHYTHM", w: 2.0 },
    { id: "FALSE_HOPE", w: 1.4 },
    { id: "COLD_NIGHT", w: 1.2 },
    { id: "HOT_LOCK", w: 1.2 }
  ]);
}

export class WorldSim {
  constructor({
    seed = "T 3.31.0",
    latDeg = 50.0755,
    panelWp = 1.0,
    tauCloudSec = 180,
    tauTempSec = 600,
    tauIrrSec = 60
  } = {}) {
    this.seed = seed;
    this.latDeg = latDeg;
    this.panelWp = panelWp;

    this.tauCloudSec = tauCloudSec;
    this.tauTempSec = tauTempSec;
    this.tauIrrSec = tauIrrSec;

    this._lastTs = null;

    // kontinuální stav (zajišťuje "no jumps")
    this._cloud = 0.5;
    this._airTempC = 10.0;
    this._irrWm2 = 0;
    this._trans = 0.7;

    // plynulé krátkodobé variace (AR procesy)
    this._noiseCloud = 0;
    this._noiseTemp = 0;
    this._noiseTrans = 0;
    this._noiseSeed = hash32(`${seed}:noise`);
  }

  _cycleInfo(nowTs) {
    // anchor: 2026-01-01 00:00 UTC posunutá seedem (deterministicky)
    const anchor = Date.UTC(2026, 0, 1, 0, 0, 0);
    const seedShiftDays = (hash32(`${this.seed}:anchor`) % CYCLE_DAYS);
    const anchorShifted = anchor - seedShiftDays * 86400000;

    const daysSince = Math.floor((nowTs - anchorShifted) / 86400000);
    const dayIn21 = ((daysSince % CYCLE_DAYS) + CYCLE_DAYS) % CYCLE_DAYS + 1; // 1..21
    const phase = cyclePhase(dayIn21);
    const weekInCycle = Math.floor((dayIn21 - 1) / 7) + 1;

    // season: jen orientačně pro UI
    const p = pragueParts(nowTs);
    const doy = dayOfYear(p.y, p.m, p.d);
    const season =
      (doy >= 80 && doy <= 171) ? "SPRING" :
      (doy >= 172 && doy <= 263) ? "SUMMER" :
      (doy >= 264 && doy <= 354) ? "AUTUMN" : "WINTER";

    return { dayIn21, weekInCycle, phase, season };
  }

  _segmentKey(nowTs, segmentHours) {
    const segMs = segmentHours * 3600 * 1000;
    const idx = Math.floor(nowTs / segMs);
    return `${idx}`;
  }

  _scenarioAndPattern(nowTs) {
    const cycle = this._cycleInfo(nowTs);

    // segmenty scénářů: delší v LEARNING, kratší v CRISIS
    const segH = cycle.phase === "LEARNING" ? 18 : (cycle.phase === "UNCERTAINTY" ? 12 : 8);
    const key = this._segmentKey(nowTs, segH);

    const rng = mulberry32(hash32(`${this.seed}:seg:${cycle.dayIn21}:${cycle.phase}:${key}`));
    const { scenario, patternChance } = weightsForPhase(cycle.phase);
    const scenarioId = pickFromWeighted(rng, scenario);

    // patterny drží déle (3× segment)
    const pSegH = segH * 3;
    const pKey = this._segmentKey(nowTs, pSegH);
    const prng = mulberry32(hash32(`${this.seed}:pat:${cycle.dayIn21}:${cycle.phase}:${pKey}`));

    const hasPattern = prng() < patternChance;
    const patternId = hasPattern ? choosePattern(prng, cycle.phase) : null;

    return { scenarioId, patternId, cycle };
  }

  _updateShortTermNoise(dtSec, nowTs, baseVar) {
    // jemná deterministická variabilita bez skoků
    const steps = Math.min(6, Math.max(1, Math.floor(dtSec / 5)));
    const subDt = dtSec / steps;

    for (let i = 0; i < steps; i++) {
      const tMs = nowTs - (steps - 1 - i) * subDt * 1000;

      const r1 = mulberry32(hash32(`${this._noiseSeed}:${Math.floor(tMs / 5000)}`))();
      const imp1 = (r1 * 2 - 1) * baseVar;
      const a1 = Math.exp(-subDt / 45);
      this._noiseCloud = this._noiseCloud * a1 + imp1 * (1 - a1);

      const r2 = mulberry32(hash32(`${this._noiseSeed}:t:${Math.floor(tMs / 7000)}`))();
      const imp2 = (r2 * 2 - 1) * (baseVar * 0.6);
      const a2 = Math.exp(-subDt / 90);
      this._noiseTemp = this._noiseTemp * a2 + imp2 * (1 - a2);

      const r3 = mulberry32(hash32(`${this._noiseSeed}:tr:${Math.floor(tMs / 6000)}`))();
      const imp3 = (r3 * 2 - 1) * (baseVar * 0.4);
      const a3 = Math.exp(-subDt / 60);
      this._noiseTrans = this._noiseTrans * a3 + imp3 * (1 - a3);
    }
  }

  getState(nowTs) {
    if (this._lastTs === null) this._lastTs = nowTs;
    const dtSec = clamp((nowTs - this._lastTs) / 1000, 0, 5); // plynulost i při výpadku
    this._lastTs = nowTs;

    const { scenarioId, patternId, cycle } = this._scenarioAndPattern(nowTs);
    const scenario = SCENARIOS[scenarioId] ?? SCENARIOS.VARIABLE_CLOUDS;
    const pattern = patternId ? (STRESS_PATTERNS[patternId] ?? null) : null;

    // denní rytmus (elevF 0..1) + sunrise/sunset "hodiny"
    const sol = elevationFactor(nowTs, this.latDeg);

    // sezónní škálování "jasné oblohy" (W/m2)
    const seasonal = 0.65 + 0.35 * Math.sin((2 * Math.PI / 365) * (sol.doy - 81)); // ~0.3..1.0
    const clearMaxWm2 = 850 * clamp(seasonal, 0.35, 1.05);

    // scénářové targety
    let cloudMean = scenario.cloudMean;
    let cloudVar = scenario.cloudVar;
    let transBase = scenario.transmittance;
    let tempOffsetC = scenario.tempOffsetC;

    // stres pattern
    if (pattern) {
      cloudMean += pattern.cloudBias ?? 0;
      cloudVar *= pattern.cloudVarMul ?? 1;
      transBase *= pattern.transMul ?? 1;
      tempOffsetC += pattern.tempBiasC ?? 0;
    }

    cloudMean = clamp01(cloudMean);
    cloudVar = clamp(cloudVar, 0.02, 0.60);
    transBase = clamp(transBase, 0.20, 0.98);

    // krátkodobá variabilita (plynulá)
    const phaseVarMul = cycle.phase === "LEARNING" ? 0.85 : (cycle.phase === "UNCERTAINTY" ? 1.05 : 1.25);
    this._updateShortTermNoise(dtSec, nowTs, 0.20 * phaseVarMul);

    const cloudTarget = clamp01(cloudMean + this._noiseCloud * cloudVar);
    const transTarget = clamp(transBase + this._noiseTrans * 0.08, 0.20, 0.98);

    // irradiance target
    const cloudImpact = 0.78;
    const irrTarget = clearMaxWm2 * sol.elevF * transTarget * (1 - cloudTarget * cloudImpact);

    // teplota: sezónní baseline + diurnál + scénář + variabilita
    const seasonalTempBase = 8 + 10 * Math.sin((2 * Math.PI / 365) * (sol.doy - 81)); // cca -2..18
    const amp = 5 + 3 * clamp(seasonal, 0.35, 1.05); // cca 6..8

    // diurnál: elevF 0..1 => -1..+1
    const k = (sol.elevF * 2) - 1;
    let tempTarget = (seasonalTempBase + tempOffsetC) + amp * k;

    // oblačnost ovlivní maxima/minima jemně
    tempTarget += (0.8 - cloudTarget) * 0.8;
    tempTarget -= cloudTarget * 0.5;

    // krátkodobé vlny
    tempTarget += this._noiseTemp * 0.7;

    // COLD_NIGHT extra ochlazení v noci (hladce)
    if (pattern && pattern.id === "COLD_NIGHT") {
      const night = 1 - smoothstep01(sol.elevF / 0.08);
      tempTarget -= (pattern.nightExtraCoolC ?? 0) * night;
    }

    // filtry => žádné skoky
    this._cloud = lowpass(this._cloud, cloudTarget, dtSec, this.tauCloudSec);
    this._trans = lowpass(this._trans, transTarget, dtSec, 240);
    this._irrWm2 = lowpass(this._irrWm2, Math.max(0, irrTarget), dtSec, this.tauIrrSec);
    this._airTempC = lowpass(this._airTempC, tempTarget, dtSec, this.tauTempSec);

    // světlo pro UI (0..1000) – jednoduché mapování z W/m2
    const light = Math.round(clamp(this._irrWm2 * 1.0, 0, 1000));

    // solarPotentialW – férové: W = Wp * (irr/1000)
    const solarPotentialW = this.panelWp * (this._irrWm2 / 1000);

    // sunrise/sunset timestamps – přibližně pro UI
    const now = new Date(nowTs);
    const localMidnight = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0).getTime();
    const sunriseTs = localMidnight + sol.sunriseHour * 3600 * 1000;
    const sunsetTs = localMidnight + sol.sunsetHour * 3600 * 1000;

    return {
      environment: {
        airTempC: this._airTempC,
        temperature: this._airTempC, // alias pro starší části
        cloud: clamp01(this._cloud),
        irradianceWm2: this._irrWm2,
        light,
        solarPotentialW,
        scenario: scenarioId,
        stressPattern: patternId ?? null,
        phase: cycle.phase
      },
      sun: {
        sunriseTs,
        sunsetTs,
        elevF: sol.elevF
      },
      cycle: {
        day: cycle.dayIn21,
        week: cycle.weekInCycle,
        phase: cycle.phase,
        season: cycle.season
      }
    };
  }
}
