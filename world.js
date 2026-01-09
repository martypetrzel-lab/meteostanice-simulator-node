// world.js (B3.20-world)
// Mega upgrade světa: B3.18 (tepelná setrvačnost) + B3.19 (sníh) + B3.20 (irradiance/solar)
// - reálný čas z state.time.now
// - 21denní cyklus, 3 týdny = 3 sezóny v rámci cyklu
// - počasí se mění během dne (cloud field, přeháňky, vítr), eventy: bouřka, nárazový vítr, mlha
// - teplota má setrvačnost (air/ground) + pocitová teplota (felt)
// - sníh: snowing, snowDepthCm, melt, rain-melt
// - irradianceWm2 + solarPotentialW (pro zařízení / UI)

const TZ = "Europe/Prague";
const LAT = 50.0755; // Praha
const LON = 14.4378;

const CYCLE_DAYS = 21;
const WEEK_LEN = 7;

// --- helpers ---
function clamp(x, a, b) { return Math.max(a, Math.min(b, x)); }
function num(x, fallback = 0) { const n = Number(x); return Number.isFinite(n) ? n : fallback; }
function lerp(a, b, t) { return a + (b - a) * t; }
function smoothstep(t) { t = clamp(t, 0, 1); return t * t * (3 - 2 * t); }

function safeInitWorld(state) {
  if (!state.world) state.world = {};
  if (!state.world.environment) state.world.environment = {};
  if (!state.world.time) state.world.time = {};
  if (!state.environment) state.environment = {}; // legacy mirror (UI compatibility)
  if (!state.memory) state.memory = {};
}

function getPragueParts(ts) {
  const parts = new Intl.DateTimeFormat("cs-CZ", {
    timeZone: TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false
  }).formatToParts(new Date(ts));

  const map = {};
  for (const p of parts) if (p.type !== "literal") map[p.type] = p.value;

  return {
    y: Number(map.year),
    m: Number(map.month),
    d: Number(map.day),
    hour: Number(map.hour),
    minute: Number(map.minute),
    second: Number(map.second),
  };
}

function pragueDateKey(ts) {
  const p = getPragueParts(ts);
  const mm = String(p.m).padStart(2, "0");
  const dd = String(p.d).padStart(2, "0");
  return `${p.y}-${mm}-${dd}`;
}

function minuteOfDay(parts) {
  return parts.hour * 60 + parts.minute + parts.second / 60;
}

// --- deterministic RNG ---
function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hashStrToSeed(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

// --- solar position (approx) ---
function solarElevationDeg(ts) {
  const date = new Date(ts);
  const y = date.getUTCFullYear();
  const start = Date.UTC(y, 0, 1);
  const doy = Math.floor((ts - start) / (24 * 3600 * 1000)) + 1;

  const hourUTC = date.getUTCHours() + date.getUTCMinutes() / 60 + date.getUTCSeconds() / 3600;

  const gamma = (2 * Math.PI / 365) * (doy - 1 + (hourUTC - 12) / 24);

  const decl =
    0.006918
    - 0.399912 * Math.cos(gamma)
    + 0.070257 * Math.sin(gamma)
    - 0.006758 * Math.cos(2 * gamma)
    + 0.000907 * Math.sin(2 * gamma)
    - 0.002697 * Math.cos(3 * gamma)
    + 0.00148 * Math.sin(3 * gamma);

  const eqtime =
    229.18 * (
      0.000075
      + 0.001868 * Math.cos(gamma)
      - 0.032077 * Math.sin(gamma)
      - 0.014615 * Math.cos(2 * gamma)
      - 0.040849 * Math.sin(2 * gamma)
    );

  const timeOffset = eqtime + 4 * LON;
  const tst = (hourUTC * 60 + timeOffset + 1440) % 1440;
  const ha = (tst / 4 < 0) ? (tst / 4 + 180) : (tst / 4 - 180);
  const haRad = ha * Math.PI / 180;

  const latRad = LAT * Math.PI / 180;

  const cosZenith =
    Math.sin(latRad) * Math.sin(decl) +
    Math.cos(latRad) * Math.cos(decl) * Math.cos(haRad);

  const zenith = Math.acos(clamp(cosZenith, -1, 1));
  const elev = (Math.PI / 2 - zenith) * 180 / Math.PI;

  return elev;
}

function approxLuxFromElevation(elevDeg) {
  // noc -> 0, soumrak -> tisíce, den -> desítky tisíc
  if (elevDeg <= -6) return 0;
  if (elevDeg < 0) return 8_000 * (elevDeg + 6) / 6;
  const x = Math.sin((elevDeg * Math.PI) / 180);
  return 110_000 * clamp(x, 0, 1);
}

// B3.20: clear-sky irradiance (W/m²) z elevace (hrubý model)
function clearIrradianceWm2(elevDeg) {
  if (elevDeg <= 0) return 0;
  const s = Math.sin((elevDeg * Math.PI) / 180);
  // tvar křivky: slabé ráno/večer, max ~950..1050 okolo poledne
  return 1000 * Math.pow(clamp(s, 0, 1), 1.15);
}

// --- 21 day cycle mapping ---
function computeCycleDay(ts) {
  const epoch = Date.UTC(2026, 0, 1);
  const days = Math.floor((ts - epoch) / (24 * 3600 * 1000));
  return ((days % CYCLE_DAYS) + CYCLE_DAYS) % CYCLE_DAYS;
}

function weekIndexFromCycleDay(cycleDay) {
  return Math.floor(cycleDay / WEEK_LEN); // 0..2
}

// 3 týdny = 3 sezóny (v rámci cyklu)
function seasonFromWeek(weekIdx) {
  if (weekIdx === 0) return "WINTER";
  if (weekIdx === 1) return "SHOULDER"; // jaro/podzim
  return "SUMMER";
}

// --- world climate memory ---
function ensureWorldClimate(state) {
  if (!state.memory.worldClimate) {
    state.memory.worldClimate = {
      version: "B3.20-world",
      dayKey: null,
      cycleDay: 0,
      weekIdx: 0,
      season: "WINTER",
      cycle: null
    };
  } else {
    state.memory.worldClimate.version = "B3.20-world";
  }
  return state.memory.worldClimate;
}

function buildCycleBlueprint() {
  const days = [];

  // multi-day fronts
  const rngFront = mulberry32(hashStrToSeed("CYCLE_FRONTS"));
  const fronts = [];
  const nFronts = 2 + Math.floor(rngFront() * 3); // 2..4
  for (let i = 0; i < nFronts; i++) {
    const start = Math.floor(rngFront() * (CYCLE_DAYS - 3));
    const len = 2 + Math.floor(rngFront() * 3); // 2..4
    const strength = 0.4 + rngFront() * 0.8; // 0.4..1.2
    const type = (rngFront() < 0.5) ? "WARM" : "COLD";
    fronts.push({ start, len, strength, type });
  }

  function frontFactorForDay(d) {
    let f = 0;
    let tBias = 0;
    for (const fr of fronts) {
      if (d >= fr.start && d < fr.start + fr.len) {
        const x = (d - fr.start) / Math.max(1, fr.len - 1);
        const bell = Math.sin(Math.PI * x);
        f += bell * fr.strength;
        tBias += bell * fr.strength * (fr.type === "WARM" ? +1 : -1);
      }
    }
    return { f: clamp(f, 0, 1.8), tBias: clamp(tBias, -1.8, 1.8) };
  }

  for (let d = 0; d < CYCLE_DAYS; d++) {
    const weekIdx = weekIndexFromCycleDay(d);
    const season = seasonFromWeek(weekIdx);

    const rng = mulberry32(hashStrToSeed(`DAY_${d}`));

    const cloudBase = clamp(rng(), 0, 1);
    const volatility = 0.25 + rng() * 0.55;
    const showerChance = clamp(0.15 + rng() * 0.75, 0, 1);
    const stormChance = clamp(0.05 + rng() * 0.35, 0, 1);

    const windBase = 0.8 + rng() * 6.5;
    const tempOffset = (rng() * 8) - 4;
    const pressureBase = 1008 + (rng() * 16 - 8);

    const fr = frontFactorForDay(d);

    const fogMorning = (season === "WINTER" || season === "SHOULDER") && (rng() < 0.35);
    const gustEvent = rng() < 0.45;
    const stormEvent = (season === "SUMMER" ? rng() < stormChance : rng() < stormChance * 0.45);

    const fogStartMin = 5 * 60 + Math.floor(rng() * 60);
    const fogDurMin = 60 + Math.floor(rng() * 120);
    const gustStartMin = 10 * 60 + Math.floor(rng() * (9 * 60));
    const gustDurMin = 20 + Math.floor(rng() * 90);
    const stormStartMin = 13 * 60 + Math.floor(rng() * (7 * 60));
    const stormDurMin = 25 + Math.floor(rng() * 80);

    days.push({
      d, weekIdx, season,
      cloudBase, volatility, showerChance, stormChance,
      windBase, tempOffset, pressureBase,
      front: fr,
      events: {
        fog: fogMorning ? { startMin: fogStartMin, durMin: fogDurMin, strength: 0.6 + rng() * 0.4 } : null,
        gust: gustEvent ? { startMin: gustStartMin, durMin: gustDurMin, strength: 0.5 + rng() * 1.1 } : null,
        storm: stormEvent ? { startMin: stormStartMin, durMin: stormDurMin, strength: 0.6 + rng() * 1.2 } : null
      }
    });
  }

  return { days, fronts };
}

// --- events ---
function inEvent(minNow, ev) {
  if (!ev) return { on: false, t: 0 };
  const start = ev.startMin;
  const end = ev.startMin + ev.durMin;
  if (minNow < start || minNow > end) return { on: false, t: 0 };
  const x = (minNow - start) / Math.max(1, ev.durMin);
  const bell = Math.sin(Math.PI * clamp(x, 0, 1));
  return { on: true, t: bell };
}

// --- intraday cloud field ---
function cloudinessAt(ts, dayBlueprint) {
  const p = getPragueParts(ts);
  const dayFrac = (minuteOfDay(p) / 1440);

  const seedBase = hashStrToSeed(`CLOUD_${dayBlueprint.d}_${p.hour}_${Math.floor(p.minute / 5)}`);
  const rng = mulberry32(seedBase);

  const w1 = Math.sin(2 * Math.PI * (dayFrac * (0.6 + dayBlueprint.volatility * 0.6) + 0.12));
  const w2 = Math.sin(2 * Math.PI * (dayFrac * (1.3 + dayBlueprint.volatility) + 0.43));
  const w3 = Math.sin(2 * Math.PI * (dayFrac * (2.1 + dayBlueprint.volatility * 1.4) + 0.71));

  const frontCloud = clamp(dayBlueprint.front.f * 0.35, 0, 0.55);
  const turb = (rng() - 0.5) * 0.18;

  const mix = 0.22 * w1 + 0.16 * w2 + 0.10 * w3;

  let cloud = dayBlueprint.cloudBase + mix + frontCloud + turb;

  if (dayBlueprint.showerChance > 0.35) {
    const cell = Math.max(0, (rng() - (0.75 - dayBlueprint.showerChance * 0.35)));
    cloud += cell * 0.55;
  }

  return clamp(cloud, 0, 1);
}

// --- pressure ---
function pressureHpa(ts, dayBlueprint) {
  const p = getPragueParts(ts);
  const dayFrac = minuteOfDay(p) / 1440;

  const frontDrop = dayBlueprint.front.f * (8 + 6 * Math.abs(dayBlueprint.front.tBias)) * 0.35;
  const wave = 1.5 * Math.sin(2 * Math.PI * (dayFrac + 0.15)) + 0.8 * Math.sin(2 * Math.PI * (dayFrac * 2 + 0.41));

  const seed = hashStrToSeed(`P_${dayBlueprint.d}_${p.hour}_${Math.floor(p.minute / 10)}`);
  const rng = mulberry32(seed);
  const noise = (rng() - 0.5) * 0.8;

  return dayBlueprint.pressureBase + wave - frontDrop + noise;
}

// --- precipitation + thunder ---
function precipitation(ts, dayBlueprint, cloud) {
  const p = getPragueParts(ts);
  const minNow = minuteOfDay(p);

  const storm = inEvent(minNow, dayBlueprint.events.storm);
  const fog = inEvent(minNow, dayBlueprint.events.fog);
  const gust = inEvent(minNow, dayBlueprint.events.gust);

  const baseChance = clamp(dayBlueprint.showerChance * 0.55 + cloud * 0.55 + dayBlueprint.front.f * 0.25 - 0.35, 0, 1);

  const seed = hashStrToSeed(`R_${dayBlueprint.d}_${p.hour}_${Math.floor(p.minute / 10)}`);
  const rng = mulberry32(seed);
  const roll = rng();

  const isShower = roll < baseChance;

  const stormOn = storm.on;
  const thunder = stormOn && (rng() < clamp(0.25 + 0.55 * storm.t, 0, 1));

  let raining = false;
  let mmh = 0;

  if (stormOn) {
    raining = true;
    const s = clamp(storm.t * (dayBlueprint.events.storm?.strength || 1), 0, 1.6);
    mmh = clamp(2 + 18 * s, 0, 24);
  } else if (isShower && cloud > 0.35) {
    raining = true;
    const s = clamp((cloud - 0.35) * 1.25 + dayBlueprint.front.f * 0.35, 0, 1.2);
    mmh = clamp(0.5 + 7.5 * s, 0, 10);
  } else {
    raining = false;
    mmh = 0;
  }

  return {
    raining,
    rainMmH: mmh,
    thunder,
    eventStorm: stormOn,
    eventFog: fog.on,
    eventGust: gust.on,
    stormBell: storm.t,
    fogBell: fog.t,
    gustBell: gust.t
  };
}

// --- season baseline (cycle-week season, not calendar season) ---
function seasonBaselineC(season) {
  if (season === "WINTER") return 3;     // ~0..6
  if (season === "SHOULDER") return 11;  // ~6..14
  return 21;                              // ~16..26
}

function diurnalTempDeltaC(hourFrac) {
  const x = Math.sin(2 * Math.PI * (hourFrac - 5 / 24));
  return 6.2 * x;
}

// --- B3.18: thermal inertia memory ---
function ensureThermalMemory(state, initialTemp = 10) {
  if (!state.memory.worldThermal) {
    state.memory.worldThermal = {
      version: "B3.18+",
      airTempC: initialTemp,
      groundTempC: initialTemp - 1.5,
      lastTs: null
    };
  }
  return state.memory.worldThermal;
}

function relaxTowards(current, target, dtSec, tauSec) {
  // exponential smoothing: current += (target-current)*(1-exp(-dt/tau))
  const a = 1 - Math.exp(-dtSec / Math.max(1, tauSec));
  return current + (target - current) * a;
}

// "instantaneous target" (bez setrvačnosti)
function targetAirTempC(ts, dayBlueprint, cloud, rain, pressure) {
  const p = getPragueParts(ts);
  const hourFrac = minuteOfDay(p) / 1440;

  const baseSeason = seasonBaselineC(dayBlueprint.season);
  const frontTemp = dayBlueprint.front.tBias * 1.6;
  const base = baseSeason + dayBlueprint.tempOffset + frontTemp;

  const diurnal = diurnalTempDeltaC(hourFrac);

  const dayness = smoothstep(clamp((Math.sin(2 * Math.PI * (hourFrac - 6 / 24)) + 1) / 2, 0, 1));
  const cloudCooling = cloud * 3.8 * dayness;
  const cloudWarmingNight = cloud * 1.7 * (1 - dayness);

  const rainCooling = rain.raining ? clamp(0.6 + rain.rainMmH * 0.08, 0.6, 2.0) : 0;
  const pAdj = clamp((1013 - pressure) * 0.02, -1.0, 1.0);

  const seed = hashStrToSeed(`T_${dayBlueprint.d}_${p.hour}_${Math.floor(p.minute / 10)}`);
  const rng = mulberry32(seed);
  const noise = (rng() - 0.5) * 0.7;

  return base + diurnal - cloudCooling + cloudWarmingNight - rainCooling - pAdj + noise;
}

// humidity
function humidityPct(airTempC, cloud, rain, pressure) {
  let h = 42 + cloud * 40;
  if (rain.raining) h += 18;
  if (rain.eventFog) h += 12;
  h += clamp((1010 - pressure) * 0.08, -4, 6);
  h += clamp((12 - airTempC) * 0.6, -8, 10);
  return clamp(h, 25, 99);
}

// wind
function windMs(ts, dayBlueprint, rain, cloud) {
  const p = getPragueParts(ts);
  const minNow = minuteOfDay(p);
  const gust = inEvent(minNow, dayBlueprint.events.gust);

  let w = dayBlueprint.windBase + dayBlueprint.front.f * 2.5 + cloud * 1.2;

  if (rain.raining) w += clamp(0.6 + rain.rainMmH * 0.06, 0.6, 2.2);
  if (rain.eventStorm) w += 2.5;

  if (gust.on) w += (2.0 + 6.5 * gust.t) * (dayBlueprint.events.gust?.strength || 1);

  const seed = hashStrToSeed(`W_${dayBlueprint.d}_${p.hour}_${Math.floor(p.minute / 5)}`);
  const rng = mulberry32(seed);
  w += (rng() - 0.5) * 1.0;

  return clamp(w, 0.2, 22);
}

// visibility & fog
function visibilityM(rain, cloud, humidity) {
  let vis = 20000;
  if (rain.eventFog) vis *= 0.25;
  if (rain.raining) vis *= clamp(1 - rain.rainMmH * 0.04, 0.35, 1.0);
  vis *= clamp(1 - cloud * 0.35, 0.55, 1.0);
  vis *= clamp(1 - (humidity - 70) * 0.006, 0.45, 1.0);
  return clamp(vis, 200, 20000);
}

// B3.18: felt temperature (simple wind chill / heat index blend)
function feltTempC(airTempC, windMsVal, humidity) {
  const v = Math.max(0, windMsVal);

  let felt = airTempC;

  // wind chill effect when cold-ish
  if (airTempC <= 12 && v > 1.3) {
    // simple approximation highlight
    felt = airTempC - (v - 1.3) * 0.7;
  }

  // heat discomfort when hot & humid
  if (airTempC >= 26 && humidity >= 60) {
    const humFactor = (humidity - 60) / 40; // 0..~1
    felt = felt + 1.5 * clamp(humFactor, 0, 1) + 0.04 * (airTempC - 26) * (humidity - 60) / 10;
  }

  return felt;
}

// --- B3.19: snow memory ---
function ensureSnowMemory(state) {
  if (!state.memory.worldSnow) {
    state.memory.worldSnow = {
      version: "B3.19+",
      snowDepthCm: 0,
      lastTs: null
    };
  }
  return state.memory.worldSnow;
}

function updateSnow(snowMem, dtSec, season, airTempC, rain) {
  let depth = num(snowMem.snowDepthCm, 0);

  // snowfall: when cold and precip present (and in winter-like season)
  const canSnow = (season === "WINTER" || season === "SHOULDER");
  const snowing = canSnow && rain.raining && airTempC <= 1.0;

  if (snowing) {
    // convert mm/h of water to cm of snow (rough: 1mm water ~ 1cm snow around 10:1)
    // dtSec -> hours
    const addCm = (rain.rainMmH * (dtSec / 3600)) * 1.0;
    depth += addCm;
  }

  // melt: when warmer
  if (depth > 0) {
    let meltRateCmPerH = 0;

    if (airTempC > 1.5) {
      // degree-hours melt
      meltRateCmPerH += clamp((airTempC - 1.5) * 0.35, 0, 2.5);
    }

    // rain accelerates melting
    if (rain.raining && airTempC > 0.5) {
      meltRateCmPerH += clamp(rain.rainMmH * 0.12, 0, 2.0);
    }

    depth -= meltRateCmPerH * (dtSec / 3600);
  }

  depth = clamp(depth, 0, 200);
  snowMem.snowDepthCm = depth;

  return { snowing, snowDepthCm: depth };
}

// --- B3.20: irradiance & solar potential ---
function transmittanceFromCloud(cloud, rain) {
  // cloud 0..1 => transmittance ~1..0.08
  let t = 1 - 0.88 * clamp(cloud, 0, 1);
  t = clamp(t, 0.08, 1);

  // precipitation reduces further (storm more)
  if (rain.raining) {
    const extra = clamp(1 - rain.rainMmH * 0.03, 0.55, 1.0);
    t *= extra;
  }
  if (rain.eventStorm) {
    t *= 0.7;
  }
  return clamp(t, 0.05, 1);
}

function solarPotentialW(state, irradianceWm2) {
  // odhad výkonu panelu bez detailní fyziky:
  // P ~= irradiance * area * efficiency, cap by device.identity.panelMaxW if exists
  const id = state?.device?.identity || null;

  const eff = clamp(num(id?.panelEfficiency, 0.18), 0.05, 0.25);
  const area = clamp(num(id?.panelAreaM2, 0.006), 0.001, 0.02); // 0.006m² ~ 1W panel při ~1000W/m² a 18%
  const cap = num(id?.panelMaxW, 1.0);

  const raw = irradianceWm2 * area * eff;
  return clamp(raw, 0, cap > 0 ? cap : raw);
}

// --- main tick ---
export function worldTick(state, dtMs = 1000) {
  safeInitWorld(state);

  const ts = num(state.time?.now, Date.now());
  state.world.time.now = ts;

  const p = getPragueParts(ts);
  const dayKey = pragueDateKey(ts);

  const climate = ensureWorldClimate(state);
  if (!climate.cycle) climate.cycle = buildCycleBlueprint();

  // select day in Prague
  if (climate.dayKey !== dayKey) {
    climate.dayKey = dayKey;
    climate.cycleDay = computeCycleDay(ts);
    climate.weekIdx = weekIndexFromCycleDay(climate.cycleDay);
    climate.season = seasonFromWeek(climate.weekIdx);
  }

  const dayBlueprint = climate.cycle.days[climate.cycleDay];

  // dt seconds (robust)
  const dtSec = clamp(num(dtMs, 1000) / 1000, 0.2, 5.0);

  // --- sun/light ---
  const elev = solarElevationDeg(ts);
  const luxClear = approxLuxFromElevation(elev);

  const cloud = cloudinessAt(ts, dayBlueprint);

  // --- precipitation/events ---
  const pressure = pressureHpa(ts, dayBlueprint);
  const rain = precipitation(ts, dayBlueprint, cloud);
  const wind = windMs(ts, dayBlueprint, rain, cloud);

  // light attenuation
  const cloudAtt = 1 - 0.86 * cloud;
  const lux = Math.max(0, luxClear * clamp(cloudAtt, 0.08, 1));

  const isDay = elev > 0;
  state.world.time.isDay = isDay;
  if (!state.time) state.time = {};
  state.time.isDay = isDay;

  // --- B3.20: irradiance + solar potential ---
  const irrClear = clearIrradianceWm2(elev);
  const trans = transmittanceFromCloud(cloud, rain);
  const irradianceWm2 = irrClear * trans;
  const solarW = solarPotentialW(state, irradianceWm2);

  // --- B3.18: thermal inertia ---
  const targetAir = targetAirTempC(ts, dayBlueprint, cloud, rain, pressure);

  const thermal = ensureThermalMemory(state, targetAir);
  // choose tau: air reacts faster, ground slower (real-ish)
  const tauAir = 25 * 60;     // 25 min
  const tauGround = 5 * 60 * 60; // 5 h

  thermal.airTempC = relaxTowards(num(thermal.airTempC, targetAir), targetAir, dtSec, tauAir);

  // ground target is smoothed air + seasonal baseline
  const groundTarget = lerp(targetAir, seasonBaselineC(dayBlueprint.season), 0.35);
  thermal.groundTempC = relaxTowards(num(thermal.groundTempC, groundTarget - 1.0), groundTarget - 1.0, dtSec, tauGround);

  const airTempC = thermal.airTempC;
  const groundTempC = thermal.groundTempC;

  // humidity derived from air temp (after inertia)
  const humidity = humidityPct(airTempC, cloud, rain, pressure);

  // felt temp
  const feltC = feltTempC(airTempC, wind, humidity);

  // visibility
  const visibility = visibilityM(rain, cloud, humidity);

  // --- B3.19: snow ---
  const snowMem = ensureSnowMemory(state);
  const snow = updateSnow(snowMem, dtSec, dayBlueprint.season, airTempC, rain);

  // snow affects: brightness (albedo) slightly in day, and night cooling slightly (handled indirectly by ground/target; keep mild)
  // We'll just expose snowDepth and snowing; device/brain can use later.

  // --- write env ---
  const env = state.world.environment;

  env.light = lux;
  env.cloud = cloud;

  // temperatures
  env.temperature = airTempC; // main external air temp
  env.airTempC = airTempC;
  env.groundTempC = groundTempC;
  env.feltTempC = feltC;

  env.humidity = humidity;

  env.pressureHpa = pressure;
  env.windMs = wind;

  env.raining = rain.raining;
  env.rainMmH = rain.rainMmH;
  env.thunder = rain.thunder;

  env.visibilityM = visibility;

  // snow (B3.19)
  env.snowing = snow.snowing;
  env.snowDepthCm = snow.snowDepthCm;

  // solar (B3.20)
  env.irradianceWm2 = irradianceWm2;
  env.solarPotentialW = solarW; // cap by identity.panelMaxW if exists

  // event flags
  env.events = {
    fog: !!rain.eventFog,
    gust: !!rain.eventGust,
    storm: !!rain.eventStorm
  };

  // cycle info
  env.cycle = {
    day: climate.cycleDay,
    week: climate.weekIdx,
    season: climate.season
  };

  // tiny human summary (for UI/debug)
  env.summary = {
    sky:
      cloud < 0.2 ? "jasno" :
      cloud < 0.45 ? "polojasno" :
      cloud < 0.7 ? "oblačno" : "zataženo",
    precip:
      rain.eventStorm ? (rain.raining ? "bouřka" : "bouřka v okolí") :
      rain.raining ? "déšť/přeháňky" : (snow.snowing ? "sněžení" : "bez srážek"),
    wind:
      wind < 2 ? "slabý" :
      wind < 6 ? "mírný" :
      wind < 10 ? "čerstvý" : "silný",
  };

  // --- legacy mirrors (UI compatibility) ---
  state.environment.light = lux;
  state.environment.temperature = airTempC;
  state.environment.humidity = humidity;
}
