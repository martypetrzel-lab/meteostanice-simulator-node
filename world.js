// world.js

const TZ = "Europe/Prague";

function getPragueParts(ts) {
  // vrátí { hour, minute, second, y, m, d } v Europe/Prague
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
  for (const p of parts) {
    if (p.type !== "literal") map[p.type] = p.value;
  }

  return {
    y: Number(map.year),
    m: Number(map.month),
    d: Number(map.day),
    hour: Number(map.hour),
    minute: Number(map.minute),
    second: Number(map.second),
  };
}

function clamp01(x) {
  return Math.max(0, Math.min(1, x));
}

export function worldTick(state, dtMs = 1000) {
  // sjednocení struktur, aby UI mělo vždy co číst
  if (!state.world) state.world = {};
  if (!state.world.environment) state.world.environment = {};
  if (!state.world.time) state.world.time = {};
  if (!state.environment) state.environment = {}; // kvůli starším částem kódu

  const now = state.time?.now ?? Date.now();
  const p = getPragueParts(now);

  // minuty od půlnoci v Praze
  const minutes = p.hour * 60 + p.minute + p.second / 60;

  // jednoduchý “sluneční” model:
  // východ ~06:00, západ ~18:00 → nejvyšší v 12:00
  const sunrise = 6 * 60;
  const sunset  = 18 * 60;

  let daylight = 0;
  if (minutes >= sunrise && minutes <= sunset) {
    // normalizace 0..1 mezi sunrise..sunset a pak sinus pro hladký průběh
    const x = (minutes - sunrise) / (sunset - sunrise); // 0..1
    daylight = Math.sin(Math.PI * x); // 0..1..0
  }

  // lux škálování (doladíš později podle toho, co chceš vidět v UI)
  const maxLux = 800;
  const lightLux = Math.round(daylight * maxLux);

  // teplota jako jednoduchá funkce světla
  const baseTemp = 12;        // noc
  const tempAmp  = 14;        // přes den
  const tempC = baseTemp + daylight * tempAmp;

  const isDay = daylight > 0.02;

  // zapis do world + mirror do legacy state.environment
  state.world.environment.light = lightLux;
  state.world.environment.temperature = tempC;

  state.world.time.now = now;
  state.world.time.isDay = isDay;

  state.environment.light = lightLux;
  state.environment.temperature = tempC;

  state.time.isDay = isDay;
}
