// world.js (B3.17-world)
// Cíl: co nejrealističtější "živý" svět, ale stále deterministický a opakovatelný v 21denním cyklu.
// - Čas = reálný čas (state.time.now)
// - 21denní cyklus = 3 týdny, každý týden jiné "roční období"
// - Během dne se podmínky mění (cloud field, přeháňky, vítr, teplota)
// - Náhodné eventy (deterministické): bouřka, nárazový vítr, mlha
// - Multi-day systémy: fronty a tlak (přechody v rámci několika dní)
//
// Zapisujeme do state.world.environment.* a zároveň mirror do state.environment.* (kompatibilita).

const TZ = "Europe/Prague";
const LAT = 50.0755; // Praha
const LON = 14.4378;

const CYCLE_DAYS = 21;
const WEEK_LEN = 7;

// ---- helpers ----
function clamp(x, a, b) { return Math.max(a, Math.min(b, x)); }
function num(x, fallback = 0) { const n = Number(x); return Number.isFinite(n) ? n : fallback; }

function safeInitWorld(state) {
  if (!state.world) state.world = {};
  if (!state.world.environment) state.world.environment = {};
  if (!state.world.time) state.world.time = {};
  if (!state.environment) state.environment = {};
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

// ---- deterministic RNG ----
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

function lerp(a, b, t) { return a + (b - a) * t; }
function smoothstep(t) { t = clamp(t, 0, 1); return t * t * (3 - 2 * t); }

// ---- solar position (approx) ----
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

// ---- 21 day cycle mapping ----
function computeCycleDay(ts) {
  const epoch = Date.UTC(2026, 0, 1); // 2026-01-01
  const days = Math.floor((ts - epoch) / (24 * 3600 * 1000));
  const cd = ((days % CYCLE_DAYS) + CYCLE_DAYS) % CYCLE_DAYS;
  return cd;
}

function weekIndexFromCycleDay(cycleDay) {
  return Math.floor(cycleDay / WEEK_LEN); // 0..2
}

// "Každý týden jiné roční období" v rámci 21 dní.
// Zvolíme: týden0 = ZIMA, týden1 = JARO/PODZIM (přechod), týden2 = LÉTO
// (Když budeš chtít: vyměníme za ZIMA/JARO/PODZIM nebo ZIMA/JARO/LÉTO – je to jen mapování.)
function seasonFromWeek(weekIdx) {
  if (weekIdx === 0) return "WINTER";
  if (weekIdx === 1) return "SHOULDER"; // jaro/podzim
  return "SUMMER";
}

// ---- memory for cycle blueprint (deterministic) ----
function ensureWorldClimate(state) {
  if (!state.memory) state.memory = {};
  if (!state.memory.worldClimate) {
    state.memory.worldClimate = {
      version: "B3.17-world",
      dayKey: null,
      cycleDay: 0,
      weekIdx: 0,
      season: "WINTER",
      // blueprint for all 21 days (repeat)
      cycle: null
    };
  }
  return state.memory.worldClimate;
}

function buildCycleBlueprint() {
  // Vygenerujeme 21 dní dopředu deterministicky podle cycleDay indexu.
  // Každý den má základ + pravděpodobnosti eventů a "front index" pro multi-day přechody.
  const days = [];

  // multi-day systems: vytvoříme 2–4 fronty v rámci 21 dní
  const rngFront = mulberry32(hashStrToSeed("CYCLE_FRONTS"));
  const fronts = [];
  const nFronts = 2 + Math.floor(rngFront() * 3); // 2..4
  for (let i = 0; i < nFronts; i++) {
    const start = Math.floor(rngFront() * (CYCLE_DAYS - 3)); // start 0..17
    const len = 2 + Math.floor(rngFront() * 3);             // 2..4 dny
    const strength = 0.4 + rngFront() * 0.8;                // 0.4..1.2
    const type = (rngFront() < 0.5) ? "WARM" : "COLD";      // teplotní skok
    fronts.push({ start, len, strength, type });
  }

  function frontFactorForDay(d) {
    // suma příspěvků front (0..~1.5)
    let f = 0;
    let tBias = 0;
    for (const fr of fronts) {
      if (d >= fr.start && d < fr.start + fr.len) {
        const x = (d - fr.start) / Math.max(1, fr.len - 1); // 0..1
        const bell = Math.sin(Math.PI * x); // 0..1..0
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

    // base cloud + volatility
    const cloudBase = clamp(rng(), 0, 1);
    const volatility = 0.25 + rng() * 0.55;  // jak rychle se během dne mění "pole oblačnosti"
    const showerChance = clamp(0.15 + rng() * 0.75, 0, 1); // přeháňky
    const stormChance = clamp(0.05 + rng() * 0.35, 0, 1);  // bouřky

    // wind base
    const windBase = 0.8 + rng() * 6.5; // m/s

    // temp offset by day
    const tempOffset = (rng() * 8) - 4; // -4..+4

    // pressure baseline
    const pressureBase = 1008 + (rng() * 16 - 8); // 1000..1016

    // front influence
    const fr = frontFactorForDay(d);

    // events counts (deterministic)
    const fogMorning = (season === "WINTER" || season === "SHOULDER") && (rng() < 0.35);
    const gustEvent = rng() < 0.45;   // nárazový vítr event je častý
    const stormEvent = (season === "SUMMER" ? rng() < stormChance : rng() < stormChance * 0.45);

    // Event times/durations
    const fogStartMin = 5 * 60 + Math.floor(rng() * 60);          // 05:00..05:59
    const fogDurMin = 60 + Math.floor(rng() * 120);               // 1..3h
    const gustStartMin = 10 * 60 + Math.floor(rng() * (9 * 60));  // 10:00..18:59
    const gustDurMin = 20 + Math.floor(rng() * 90);               // 20..110 min
    const stormStartMin = 13 * 60 + Math.floor(rng() * (7 * 60)); // 13:00..19:59
    const stormDurMin = 25 + Math.floor(rng() * 80);              // 25..105 min

    days.push({
      d,
      weekIdx,
      season,
      cloudBase,
      volatility,
      showerChance,
      stormChance,
      windBase,
      tempOffset,
      pressureBase,
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

// ---- dynamic fields (intraday variability) ----
function minuteOfDay(parts) {
  return parts.hour * 60 + parts.minute + parts.second / 60;
}

function inEvent(minNow, ev) {
  if (!ev) return { on: false, t: 0 };
  const start = ev.startMin;
  const end = ev.startMin + ev.durMin;
  if (minNow < start || minNow > end) return { on: false, t: 0 };
  const x = (minNow - start) / Math.max(1, ev.durMin);
  // bell curve 0..1..0
  const bell = Math.sin(Math.PI * clamp(x, 0, 1));
  return { on: true, t: bell };
}

// "cloud field": kombinace základ + několik vln + front factor + lokální "shower cells"
function cloudinessAt(ts, dayBlueprint) {
  const p = getPragueParts(ts);
  const dayFrac = (minuteOfDay(p) / 1440);

  const seedBase = hashStrToSeed(`CLOUD_${dayBlueprint.d}_${p.hour}_${Math.floor(p.minute / 5)}`);
  const rng = mulberry32(seedBase);

  // velké struktury (pomalejší)
  const w1 = Math.sin(2 * Math.PI * (dayFrac * (0.6 + dayBlueprint.volatility * 0.6) + 0.12));
  const w2 = Math.sin(2 * Math.PI * (dayFrac * (1.3 + dayBlueprint.volatility) + 0.43));
  const w3 = Math.sin(2 * Math.PI * (dayFrac * (2.1 + dayBlueprint.volatility * 1.4) + 0.71));

  // fronty zvyšují oblačnost
  const frontCloud = clamp(dayBlueprint.front.f * 0.35, 0, 0.55);

  // drobná turbulence (každých 5 min stabilní)
  const turb = (rng() - 0.5) * 0.18;

  const mix = 0.22 * w1 + 0.16 * w2 + 0.10 * w3;

  // baseline
  let cloud = dayBlueprint.cloudBase + mix + frontCloud + turb;

  // "shower cells": pokud je den s přeháňkami, občasné výstřely oblačnosti
  if (dayBlueprint.showerChance > 0.35) {
    const cell = Math.max(0, (rng() - (0.75 - dayBlueprint.showerChance * 0.35)));
    cloud += cell * 0.55;
  }

  return clamp(cloud, 0, 1);
}

// ---- pressure model (fronts + intraday small drift) ----
function pressureHpa(ts, dayBlueprint) {
  const p = getPragueParts(ts);
  const dayFrac = minuteOfDay(p) / 1440;

  // fronty typicky snižují tlak
  const frontDrop = dayBlueprint.front.f * (8 + 6 * Math.abs(dayBlueprint.front.tBias)) * 0.35; // ~0..5

  // denní mikrovlnění tlaku
  const wave = 1.5 * Math.sin(2 * Math.PI * (dayFrac + 0.15)) + 0.8 * Math.sin(2 * Math.PI * (dayFrac * 2 + 0.41));

  // drobný deterministic noise po 10 min
  const seed = hashStrToSeed(`P_${dayBlueprint.d}_${p.hour}_${Math.floor(p.minute / 10)}`);
  const rng = mulberry32(seed);
  const noise = (rng() - 0.5) * 0.8;

  return dayBlueprint.pressureBase + wave - frontDrop + noise;
}

// ---- precipitation & thunder ----
function precipitation(ts, dayBlueprint, cloud) {
  const p = getPragueParts(ts);
  const minNow = minuteOfDay(p);

  const storm = inEvent(minNow, dayBlueprint.events.storm);
  const fog = inEvent(minNow, dayBlueprint.events.fog); // fog doesn't add rain directly
  const gust = inEvent(minNow, dayBlueprint.events.gust); // gust doesn't add rain directly

  // base shower chance grows with cloud & front
  const baseChance = clamp(dayBlueprint.showerChance * 0.55 + cloud * 0.55 + dayBlueprint.front.f * 0.25 - 0.35, 0, 1);

  // deterministic per 10 minutes
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
    // bouřka: 2..20 mm/h podle síly
    const s = clamp(storm.t * (dayBlueprint.events.storm?.strength || 1), 0, 1.6);
    mmh = clamp(2 + 18 * s, 0, 24);
  } else if (isShower && cloud > 0.35) {
    raining = true;
    // přeháňka: 0.5..8 mm/h
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

// ---- temperature / humidity / wind ----
function seasonBaselineC(season) {
  // „týdenní sezóna“ v rámci cyklu (ne roční doba v kalendáři)
  // WINTER ~0..6, SHOULDER ~6..14, SUMMER ~16..26 (Praha-ish)
  if (season === "WINTER") return 3;
  if (season === "SHOULDER") return 11;
  return 21;
}

function diurnalTempDeltaC(hourFrac) {
  // min ~05:00, max ~15:00
  const x = Math.sin(2 * Math.PI * (hourFrac - 5 / 24));
  return 6.2 * x; // amplitude
}

function temperatureC(ts, dayBlueprint, cloud, rain, pressure) {
  const p = getPragueParts(ts);
  const hourFrac = (minuteOfDay(p) / 1440);

  // baseline dle "sezóny týdne" v cyklu
  const baseSeason = seasonBaselineC(dayBlueprint.season);

  // denní offset a front bias (warm/cold front)
  const frontTemp = dayBlueprint.front.tBias * 1.6; // -..+
  const base = baseSeason + dayBlueprint.tempOffset + frontTemp;

  // diurnální cyklus
  const diurnal = diurnalTempDeltaC(hourFrac);

  // cloud effect: přes den chladí, v noci lehce přihřívá
  const dayness = smoothstep(clamp((Math.sin(2 * Math.PI * (hourFrac - 6 / 24)) + 1) / 2, 0, 1));
  const cloudCooling = cloud * 3.8 * dayness;
  const cloudWarmingNight = cloud * 1.7 * (1 - dayness);

  // rain cooling
  const rainCooling = rain.raining ? clamp(0.6 + rain.rainMmH * 0.08, 0.6, 2.0) : 0;

  // pressure correlation: nízký tlak -> mírně chladněji
  const pAdj = clamp((1013 - pressure) * 0.02, -1.0, 1.0);

  // deterministic noise per 10 min
  const seed = hashStrToSeed(`T_${dayBlueprint.d}_${p.hour}_${Math.floor(p.minute / 10)}`);
  const rng = mulberry32(seed);
  const noise = (rng() - 0.5) * 0.7;

  return base + diurnal - cloudCooling + cloudWarmingNight - rainCooling - pAdj + noise;
}

function humidityPct(tempC, cloud, rain, pressure) {
  // základ z cloud + rain, mírně dle tlaku
  let h = 42 + cloud * 40;
  if (rain.raining) h += 18;
  if (rain.eventFog) h += 12;
  h += clamp((1010 - pressure) * 0.08, -4, 6);

  // tepleji -> relativní vlhkost typicky nižší (zjednodušení)
  h += clamp((12 - tempC) * 0.6, -8, 10);

  return clamp(h, 25, 99);
}

function windMs(ts, dayBlueprint, rain, cloud) {
  const p = getPragueParts(ts);
  const minNow = minuteOfDay(p);
  const gust = inEvent(minNow, dayBlueprint.events.gust);

  // base wind varies with fronts and cloudiness
  let w = dayBlueprint.windBase + dayBlueprint.front.f * 2.5 + cloud * 1.2;

  // rain/storm increases wind
  if (rain.raining) w += clamp(0.6 + rain.rainMmH * 0.06, 0.6, 2.2);
  if (rain.eventStorm) w += 2.5;

  // gust event: add spikes
  if (gust.on) w += (2.0 + 6.5 * gust.t) * (dayBlueprint.events.gust?.strength || 1);

  // deterministic micro gust per 5 min
  const seed = hashStrToSeed(`W_${dayBlueprint.d}_${p.hour}_${Math.floor(p.minute / 5)}`);
  const rng = mulberry32(seed);
  w += (rng() - 0.5) * 1.0;

  return clamp(w, 0.2, 22);
}

// ---- visibility & fog ----
function visibilityM(rain, cloud, humidity) {
  // základ 20km, snižují: mlha, déšť, vysoká vlhkost, oblačnost
  let vis = 20000;

  if (rain.eventFog) vis *= 0.25;         // mlha
  if (rain.raining) vis *= clamp(1 - rain.rainMmH * 0.04, 0.35, 1.0);
  vis *= clamp(1 - cloud * 0.35, 0.55, 1.0);
  vis *= clamp(1 - (humidity - 70) * 0.006, 0.45, 1.0);

  return clamp(vis, 200, 20000);
}

// ---- main tick ----
export function worldTick(state, dtMs = 1000) {
  safeInitWorld(state);

  const ts = num(state.time?.now, Date.now());
  state.world.time.now = ts;

  const p = getPragueParts(ts);
  const dayKey = pragueDateKey(ts);

  const climate = ensureWorldClimate(state);

  // rebuild cycle blueprint once
  if (!climate.cycle) {
    climate.cycle = buildCycleBlueprint();
  }

  // update daily selection when day changes (Prague)
  if (climate.dayKey !== dayKey) {
    climate.dayKey = dayKey;
    climate.cycleDay = computeCycleDay(ts);
    climate.weekIdx = weekIndexFromCycleDay(climate.cycleDay);
    climate.season = seasonFromWeek(climate.weekIdx);
  }

  const dayBlueprint = climate.cycle.days[climate.cycleDay];

  // ---- light/day based on sun ----
  const elev = solarElevationDeg(ts);
  const luxClear = approxLuxFromElevation(elev);

  // cloud field
  const cloud = cloudinessAt(ts, dayBlueprint);

  // cloud attenuation (heavier clouds = výrazně méně lux)
  const cloudAtt = 1 - 0.86 * cloud;   // 1 .. ~0.14
  const lux = Math.max(0, luxClear * clamp(cloudAtt, 0.08, 1));

  const isDay = elev > 0;
  state.world.time.isDay = isDay;
  if (!state.time) state.time = {};
  state.time.isDay = isDay;

  // ---- pressure ----
  const pressure = pressureHpa(ts, dayBlueprint);

  // ---- rain / thunder / events ----
  const rain = precipitation(ts, dayBlueprint, cloud);

  // ---- wind ----
  const wind = windMs(ts, dayBlueprint, rain, cloud);

  // ---- temperature ----
  const temp = temperatureC(ts, dayBlueprint, cloud, rain, pressure);

  // ---- humidity ----
  const humidity = humidityPct(temp, cloud, rain, pressure);

  // ---- visibility ----
  const visibility = visibilityM(rain, cloud, humidity);

  // ---- write env ----
  const env = state.world.environment;

  env.light = lux;
  env.cloud = cloud;

  env.temperature = temp;
  env.humidity = humidity;

  env.pressureHpa = pressure;
  env.windMs = wind;

  env.raining = rain.raining;
  env.rainMmH = rain.rainMmH;
  env.thunder = rain.thunder;

  env.visibilityM = visibility;

  // event flags for UI/debug
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

  // ---- legacy mirrors ----
  state.environment.light = lux;
  state.environment.temperature = temp;
  state.environment.humidity = humidity;

  // ---- optional: add simple textual summary (pro debug/UI) ----
  // (nekřičí, jen info)
  env.summary = {
    sky:
      cloud < 0.2 ? "jasno" :
      cloud < 0.45 ? "polojasno" :
      cloud < 0.7 ? "oblačno" : "zataženo",
    precip:
      rain.eventStorm ? (rain.raining ? "bouřka" : "bouřka v okolí") :
      rain.raining ? "déšť/přeháňky" : "bez srážek",
    wind:
      wind < 2 ? "slabý" :
      wind < 6 ? "mírný" :
      wind < 10 ? "čerstvý" : "silný",
  };
}
