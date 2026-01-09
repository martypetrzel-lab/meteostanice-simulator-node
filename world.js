// world.js (B3.16-world)
// Realističtější svět:
// - světlo podle slunce (Praha) + oblačnost
// - teplota: denní křivka + vliv oblačnosti + mírná náhodnost (deterministická)
// - vlhkost, vítr, srážky (deterministicky z 21denního cyklu)
// - 21denní cyklus: charakter dne se opakuje každých 21 dní, ale čas běží reálně
//
// Pozn.: zapisujeme jak do state.world.environment, tak i do state.environment (kompatibilita)

const TZ = "Europe/Prague";
const LAT = 50.0755; // Praha
const LON = 14.4378;

const CYCLE_DAYS = 21;

function clamp(x, a, b) {
  return Math.max(a, Math.min(b, x));
}

function num(x, fallback = 0) {
  const n = Number(x);
  return Number.isFinite(n) ? n : fallback;
}

function safeInitWorld(state) {
  if (!state.world) state.world = {};
  if (!state.world.environment) state.world.environment = {};
  if (!state.world.time) state.world.time = {};
  if (!state.environment) state.environment = {}; // legacy alias
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

function dayOfYear(ts) {
  // day-of-year in Prague (rough: based on local date parts)
  const p = getPragueParts(ts);
  const start = Date.UTC(p.y, 0, 1);
  const cur = Date.UTC(p.y, p.m - 1, p.d);
  return Math.floor((cur - start) / (24 * 3600 * 1000)) + 1;
}

// --- deterministic PRNG (mulberry32) ---
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
  // jednoduchý string hash do 32-bit
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function smoothstep(t) {
  t = clamp(t, 0, 1);
  return t * t * (3 - 2 * t);
}

// --- Solar position (NOAA-ish approximation) ---
function solarElevationDeg(ts) {
  // approximate solar elevation for given lat/lon and time
  const date = new Date(ts);

  // UTC fractional year
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

  // time offset (minutes)
  const timeOffset = eqtime + 4 * LON;

  // true solar time (minutes)
  const tst = (hourUTC * 60 + timeOffset + 1440) % 1440;

  // hour angle
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
  // hrubý převod elevace na lux (bez oblačnosti)
  if (elevDeg <= -6) return 0;                 // noc
  if (elevDeg < 0) return 5_000 * (elevDeg + 6) / 6;  // občanský soumrak
  // den: do ~100k lux kolem poledne
  const x = Math.sin((elevDeg * Math.PI) / 180);
  return 100_000 * clamp(x, 0, 1);
}

// --- 21 day cycle weather "day profile" ---
function ensureWeatherMemory(state) {
  if (!state.memory) state.memory = {};
  if (!state.memory.worldWeather) {
    state.memory.worldWeather = {
      version: "B3.16-world",
      dayKey: null,
      cycleDay: 0,
      // "daily params" (repeat by cycleDay)
      params: null
    };
  }
  return state.memory.worldWeather;
}

function computeCycleDay(ts) {
  // cycle anchored to fixed epoch, so it repeats every 21 days forever
  const epoch = Date.UTC(2026, 0, 1); // 2026-01-01
  const days = Math.floor((ts - epoch) / (24 * 3600 * 1000));
  const cd = ((days % CYCLE_DAYS) + CYCLE_DAYS) % CYCLE_DAYS;
  return cd;
}

function newDailyParams(ts, cycleDay) {
  // deterministic "character" based on cycleDay
  const key = `${cycleDay}`;
  const rng = mulberry32(hashStrToSeed(key));

  // base cloudiness 0..1
  const cloudBase = clamp(rng(), 0, 1);
  // rain tendency
  const rainBase = clamp(rng(), 0, 1);
  // wind base
  const windBase = 1 + rng() * 6; // 1..7 m/s
  // temp offset (daily) -3..+3
  const tempOffset = (rng() * 6) - 3;

  // multi-hour cloud wobble
  const cloudWave = 0.15 + rng() * 0.25; // amplitude
  const cloudShift = rng() * Math.PI * 2;

  // rain windows
  const rainStartH = Math.floor(6 + rng() * 10); // 6..15
  const rainLenH = Math.floor(1 + rng() * 4);    // 1..4

  return {
    cycleDay,
    cloudBase,
    cloudWave,
    cloudShift,
    rainBase,
    rainStartH,
    rainLenH,
    windBase,
    tempOffset
  };
}

function cloudinessAt(ts, params) {
  const p = getPragueParts(ts);
  const dayFrac = (p.hour + p.minute / 60 + p.second / 3600) / 24;

  // smooth daily curve: more clouds in morning/evening slightly
  const diurnal = 0.08 * Math.sin(2 * Math.PI * (dayFrac - 0.15));

  // wave
  const wave = params.cloudWave * Math.sin(2 * Math.PI * dayFrac + params.cloudShift);

  return clamp(params.cloudBase + diurnal + wave, 0, 1);
}

function isRainingAt(ts, params, cloud) {
  const p = getPragueParts(ts);
  const h = p.hour;

  const inWindow = (h >= params.rainStartH && h < params.rainStartH + params.rainLenH);
  const chance = clamp((params.rainBase * 0.7 + cloud * 0.6) - 0.35, 0, 1);

  // deterministic per hour
  const seed = hashStrToSeed(`${params.cycleDay}-${h}`);
  const rng = mulberry32(seed);
  const roll = rng();

  return inWindow && roll < chance;
}

function rainIntensityMmH(params, cloud) {
  // 0..~6 mm/h
  const base = (params.rainBase * 0.6 + cloud * 0.6);
  return clamp(base * 6, 0, 6);
}

// Temperature model: seasonal + diurnal + clouds + daily offset
function temperatureC(ts, params, cloud) {
  const p = getPragueParts(ts);
  const doy = dayOfYear(ts);

  // seasonal average in Prague (rough): winter ~2°C, summer ~22°C
  const seasonal = 12 + 10 * Math.sin((2 * Math.PI * (doy - 172)) / 365);

  // diurnal curve (min at ~5:00, max at ~15:00)
  const hour = p.hour + p.minute / 60 + p.second / 3600;
  const diurnalRaw = Math.sin((2 * Math.PI * (hour - 5)) / 24); // -1..1
  const diurnal = 6 * diurnalRaw; // amplitude ~6°C

  // clouds reduce daytime heating, increase night temp slightly
  const dayness = smoothstep(clamp((Math.sin((2 * Math.PI * (hour - 6)) / 24) + 1) / 2, 0, 1));
  const cloudCooling = (cloud * 3.5) * dayness;     // up to -3.5°C in day
  const cloudWarmingNight = (cloud * 1.5) * (1 - dayness); // up to +1.5°C at night

  // tiny deterministic noise by minute
  const seed = hashStrToSeed(`${params.cycleDay}-${p.hour}-${Math.floor(p.minute / 10)}`);
  const rng = mulberry32(seed);
  const noise = (rng() - 0.5) * 0.6; // ±0.3°C

  return seasonal + diurnal + params.tempOffset - cloudCooling + cloudWarmingNight + noise;
}

function humidityPct(cloud, raining) {
  // 35..95 %
  let h = 45 + cloud * 40;
  if (raining) h += 15;
  return clamp(h, 30, 98);
}

function windMs(params, raining) {
  // 0.5..12 m/s
  let w = params.windBase;
  if (raining) w += 1.5;
  return clamp(w, 0.5, 12);
}

export function worldTick(state, dtMs = 1000) {
  safeInitWorld(state);

  const ts = num(state.time?.now, Date.now());

  // keep world time mirrors
  state.world.time.now = ts;

  // --- daily params update (by Prague day key, cycle repeats 21d) ---
  const mem = ensureWeatherMemory(state);
  const dayKey = pragueDateKey(ts);

  if (mem.dayKey !== dayKey) {
    mem.dayKey = dayKey;
    mem.cycleDay = computeCycleDay(ts);
    mem.params = newDailyParams(ts, mem.cycleDay);
  }

  const params = mem.params;

  // --- light/day ---
  const elev = solarElevationDeg(ts);
  const luxClear = approxLuxFromElevation(elev);

  // cloud attenuation: heavy clouds can drop lux significantly
  const cloud = cloudinessAt(ts, params);
  const cloudAtt = 1 - 0.82 * cloud; // 1 .. ~0.18
  const lux = Math.max(0, luxClear * cloudAtt);

  const isDay = elev > 0;
  state.world.time.isDay = isDay;

  // --- rain ---
  const raining = isRainingAt(ts, params, cloud);
  const rainMmH = raining ? rainIntensityMmH(params, cloud) : 0;

  // --- temperature / humidity / wind ---
  const temp = temperatureC(ts, params, cloud) - (raining ? 0.8 : 0);
  const hum = humidityPct(cloud, raining);
  const wind = windMs(params, raining);

  // write env (primary)
  state.world.environment.light = lux;
  state.world.environment.temperature = temp;
  state.world.environment.humidity = hum;
  state.world.environment.cloud = cloud;
  state.world.environment.raining = raining;
  state.world.environment.rainMmH = rainMmH;
  state.world.environment.windMs = wind;

  // also mirror legacy env if UI/backend čte "state.environment.*"
  state.environment.light = lux;
  state.environment.temperature = temp;
  state.environment.humidity = hum;

  // also mirror state.time.isDay (někde se používá)
  if (!state.time) state.time = {};
  state.time.isDay = isDay;
}
