// brain.js (B 3.11)
// - Trend, rizika, stavové rozhodování
// - Učení ze soláru: hodinový profil (EMA), predikce zbytku dne
// - Výdrž na baterku (hodiny) vždy viditelná v UI

import { rememberExperience } from "./memory.js";

const TZ = "Europe/Prague";
const SUNRISE_H = 6;
const SUNSET_H = 18;

/** Bezpečné čtení z objektu */
function safeGet(obj, path, fallback = null) {
  try {
    return path.split(".").reduce((a, k) => (a && a[k] !== undefined ? a[k] : undefined), obj) ?? fallback;
  } catch {
    return fallback;
  }
}

function clamp(x, a, b) {
  return Math.max(a, Math.min(b, x));
}

function fmt(n, d = 2) {
  if (n === null || n === undefined || Number.isNaN(n)) return "—";
  return Number(n).toFixed(d);
}

function nowMs(state) {
  return Number(safeGet(state, "time.now", Date.now()));
}

/** Praha parts */
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

/** Odhad do východu slunce (jednoduše) */
function msToNextSunrise(ts, sunriseHour = SUNRISE_H, sunriseMinute = 0) {
  const p = getPragueParts(ts);
  const nowMin = p.hour * 60 + p.minute + p.second / 60;
  const sunriseMin = sunriseHour * 60 + sunriseMinute;

  let deltaMin;
  if (nowMin <= sunriseMin) deltaMin = sunriseMin - nowMin;
  else deltaMin = (24 * 60 - nowMin) + sunriseMin;

  return Math.round(deltaMin * 60 * 1000);
}

function msToNextSunset(ts, sunsetHour = SUNSET_H, sunsetMinute = 0) {
  const p = getPragueParts(ts);
  const nowMin = p.hour * 60 + p.minute + p.second / 60;
  const sunsetMin = sunsetHour * 60 + sunsetMinute;

  let deltaMin;
  if (nowMin <= sunsetMin) deltaMin = sunsetMin - nowMin;
  else deltaMin = 0;

  return Math.round(deltaMin * 60 * 1000);
}

/** Získej SOC v % co nejrobustněji */
function getSocPct(state) {
  const socPct =
    safeGet(state, "device.socPct", null) ??
    (safeGet(state, "device.battery.soc", null) !== null ? safeGet(state, "device.battery.soc", 0) * 100 : null) ??
    safeGet(state, "device.batteryPct", null) ??
    safeGet(state, "device.battery", null);

  if (socPct === null || socPct === undefined) return null;
  return clamp(Number(socPct), 0, 100);
}

/** Získej výkonové hodnoty */
function getPower(state) {
  const solarW =
    safeGet(state, "device.solarInW", null) ??
    safeGet(state, "device.power.solarInW", null) ??
    0;

  const loadW =
    safeGet(state, "device.loadW", null) ??
    safeGet(state, "device.power.loadW", null) ??
    0;

  const netW = Number(solarW) - Number(loadW);
  return { solarW: Number(solarW) || 0, loadW: Number(loadW) || 0, netW };
}

/** Odhad výdrže v hodinách (Wh / W). Preferuje balanceWh, fallback batteryCapacityWh. */
function estimateHoursFromWh(state, netOrLoadW) {
  const balWh =
    safeGet(state, "device.power.balanceWh", null) ??
    safeGet(state, "device.battery.balanceWh", null) ??
    null;

  const w = Math.max(0.001, Math.abs(netOrLoadW || 0.001));

  if (balWh !== null && balWh !== undefined) {
    return Number(balWh) / w;
  }

  const socPct = getSocPct(state);
  const capWh = Number(safeGet(state, "device.batteryCapacityWh", 11.1));
  if (socPct === null) return null;

  const availWh = (capWh * socPct) / 100;
  return availWh / w;
}

/** Runtime historie pro trend (běhově) */
function ensureBrainRuntime(state) {
  if (!state.memory) state.memory = {};
  if (!state.memory.brainRuntime) {
    state.memory.brainRuntime = {
      samples: [], // {t, socPct, netW}
      lastState: null,
      lastStateChange: null
    };
  }
  return state.memory.brainRuntime;
}

/** Model učení (dlouhodobý) */
function ensureBrainModel(state) {
  if (!state.memory) state.memory = {};
  if (!state.memory.brainModel) {
    state.memory.brainModel = {
      version: "B3.11",
      conservativeness: 1.0,
      nightReservePct: 25,
      samplingAggressiveness: 0.55,
      counters: {
        riskEvents: 0,
        criticalEvents: 0,
        deepDischargeEvents: 0,
        overheatEvents: 0
      }
    };
  } else {
    // bump version (bez resetu)
    state.memory.brainModel.version = "B3.11";
  }
  return state.memory.brainModel;
}

/** Solární profil (učení po hodinách, EMA) */
function ensureSolarProfile(state) {
  if (!state.memory) state.memory = {};
  if (!state.memory.solarProfile) {
    const hours = {};
    for (let h = 0; h < 24; h++) {
      hours[h] = { emaW: 0, n: 0, lastTs: null };
    }
    state.memory.solarProfile = {
      version: "B3.11",
      hours
    };
  }
  return state.memory.solarProfile;
}

function updateSolarProfile(profile, hour, solarW, ts) {
  const bin = profile.hours[hour];
  if (!bin) return;

  // Učíme jen reálný "daylight" interval (aby noc netlačila EMA k nule)
  if (hour < SUNRISE_H || hour >= SUNSET_H) return;

  // EMA: ze startu rychle, později pomaleji
  const n = (bin.n || 0) + 1;
  bin.n = n;

  // alpha 0.25 na začátku, postupně k 0.03
  const alpha = clamp(0.25 / Math.sqrt(n), 0.03, 0.25);
  bin.emaW = (n === 1) ? solarW : (bin.emaW + alpha * (solarW - bin.emaW));
  bin.lastTs = ts;
}

/** Predikce zbytku soláru do západu podle profilu */
function expectedSolarWhRemaining(ts, profile) {
  const p = getPragueParts(ts);

  // po západu nic
  if (p.hour >= SUNSET_H) return 0;

  const nowMin = p.hour * 60 + p.minute + p.second / 60;
  const sunsetMin = SUNSET_H * 60;

  let wh = 0;

  // projdeme hodiny od current do sunset-1
  for (let h = p.hour; h < SUNSET_H; h++) {
    const bin = profile.hours[h];
    const emaW = bin ? Number(bin.emaW || 0) : 0;

    // kolik minut zbývá v této hodině
    let fromMin = 0;
    let toMin = 60;

    if (h === p.hour) fromMin = nowMin - h * 60;
    if (h === SUNSET_H - 1) toMin = sunsetMin - h * 60;

    const minutes = clamp(toMin - fromMin, 0, 60);
    const hours = minutes / 60;

    wh += emaW * hours;
  }

  return Math.max(0, wh);
}

/** Aktualizace runtime sample listu */
function pushSample(runtime, t, socPct, netW) {
  runtime.samples.push({ t, socPct, netW });

  const KEEP_MS = 6 * 60 * 60 * 1000;
  const minT = t - KEEP_MS;
  runtime.samples = runtime.samples.filter(s => s.t >= minT);

  if (runtime.samples.length > 4000) {
    runtime.samples = runtime.samples.slice(runtime.samples.length - 4000);
  }
}

/** Trend SOC v %/hod z posledních X minut */
function socTrendPctPerHour(runtime, windowMin = 30) {
  const now = runtime.samples.length ? runtime.samples[runtime.samples.length - 1].t : null;
  if (!now) return null;

  const minT = now - windowMin * 60 * 1000;
  const slice = runtime.samples.filter(s => s.t >= minT && s.socPct !== null && s.socPct !== undefined);
  if (slice.length < 2) return null;

  const first = slice[0];
  const last = slice[slice.length - 1];

  const dtH = (last.t - first.t) / (1000 * 60 * 60);
  if (dtH <= 0) return null;

  return (last.socPct - first.socPct) / dtH;
}

/** Vyhodnocení energetického stavu */
function classifyEnergyState({ netW, socPct, hoursLeftNet }, isDay, model) {
  const cons = clamp(model.conservativeness, 0.7, 1.6);

  const reserve = clamp(model.nightReservePct, 10, 50);
  const criticalSoc = 10 * cons;
  const riskSoc = Math.max(reserve, 18 * cons);

  if (netW >= 0.02) return "POSITIVE";
  if (netW > -0.02 && netW < 0.02) return "BALANCED";

  if (socPct !== null && socPct <= criticalSoc) return "CRITICAL";

  if (hoursLeftNet !== null && hoursLeftNet !== undefined) {
    const strictHours = isDay ? 6 * cons : 10 * cons;
    if (hoursLeftNet <= strictHours) return "DRAINING_RISK";
  }

  if (socPct !== null && socPct <= riskSoc) return "DRAINING_RISK";

  return "DRAINING_SAFE";
}

/** Režim sběru dat podle stavu */
function decideSampling(energyState, isDay, model) {
  const a = clamp(model.samplingAggressiveness, 0, 1);
  switch (energyState) {
    case "POSITIVE":
      return a > 0.6 ? "HIGH" : "NORMAL";
    case "BALANCED":
      return "NORMAL";
    case "DRAINING_SAFE":
      return isDay ? "NORMAL" : "LOW";
    case "DRAINING_RISK":
      return "ULTRA_LOW";
    case "CRITICAL":
    default:
      return "HIBERNATE";
  }
}

/** Učení: uprav model podle toho, jak často padáš do rizik/kritiky */
function learn(model, energyState, socTrendPH, isDay, netW) {
  const c = model.counters;

  if (energyState === "DRAINING_RISK") c.riskEvents += 1;
  if (energyState === "CRITICAL") c.criticalEvents += 1;

  if (socTrendPH !== null && socTrendPH < -5) {
    model.conservativeness = clamp(model.conservativeness + 0.01, 0.7, 1.6);
    model.nightReservePct = clamp(model.nightReservePct + 0.2, 10, 50);
    model.samplingAggressiveness = clamp(model.samplingAggressiveness - 0.01, 0, 1);
  }

  if (netW > 0.2 && isDay) {
    model.conservativeness = clamp(model.conservativeness - 0.002, 0.7, 1.6);
    model.samplingAggressiveness = clamp(model.samplingAggressiveness + 0.002, 0, 1);
  }

  if (c.riskEvents > 60) {
    model.conservativeness = clamp(model.conservativeness + 0.02, 0.7, 1.6);
    model.nightReservePct = clamp(model.nightReservePct + 0.5, 10, 50);
    model.samplingAggressiveness = clamp(model.samplingAggressiveness - 0.02, 0, 1);
    c.riskEvents = 0;
  }

  if (c.criticalEvents > 30) {
    model.conservativeness = clamp(model.conservativeness + 0.05, 0.7, 1.6);
    model.nightReservePct = clamp(model.nightReservePct + 1.0, 10, 50);
    model.samplingAggressiveness = clamp(model.samplingAggressiveness - 0.03, 0, 1);
    c.criticalEvents = 0;
  }
}

/** Text do UI */
function makeMessage(energyState, isDay, netW) {
  const sign = netW >= 0 ? "+" : "";
  const netTxt = `${sign}${fmt(netW, 2)} W`;

  switch (energyState) {
    case "POSITIVE":
      return `Energetický zisk, sbírám data (net ${netTxt})`;
    case "BALANCED":
      return `Vyrovnané podmínky, sbírám data (net ${netTxt})`;
    case "DRAINING_SAFE":
      return isDay
        ? `Mírné vybíjení, řízený sběr (net ${netTxt})`
        : `Noční režim, vybíjím baterii (net ${netTxt})`;
    case "DRAINING_RISK":
      return `RIZIKO: omezím spotřebu a sběr (net ${netTxt})`;
    case "CRITICAL":
    default:
      return `KRITICKÝ STAV: šetřím energii (net ${netTxt})`;
  }
}

function setDeviceDirectives(state, samplingMode, energyState) {
  if (!state.device) state.device = {};

  state.device.samplingMode = samplingMode;
  state.device.savingMode = ["DRAINING_RISK", "CRITICAL"].includes(energyState);

  const interval =
    samplingMode === "HIGH" ? 5 :
    samplingMode === "NORMAL" ? 10 :
    samplingMode === "LOW" ? 20 :
    samplingMode === "ULTRA_LOW" ? 60 :
    180;

  state.device.collectionIntervalSec = interval;
}

/** Fan rozhodnutí: jen když to dává smysl energeticky */
function decideFan(state, energyState, socPct) {
  const t = Number(
    safeGet(state, "world.environment.temperature", null) ??
    safeGet(state, "environment.temperature", null) ??
    safeGet(state, "device.temperature", null) ??
    0
  );

  if (energyState === "CRITICAL") return { fan: false, reason: "kritická energie" };

  const onT = 30;
  const offT = 27;

  const current = !!safeGet(state, "device.fan", false);

  if (energyState === "DRAINING_RISK") {
    if (t >= 33 && (socPct === null || socPct > 15)) return { fan: true, reason: "vysoká teplota i přes riziko" };
    return { fan: false, reason: "šetřím energii (riziko)" };
  }

  if (!current && t >= onT) return { fan: true, reason: "teplota vysoká" };
  if (current && t <= offT) return { fan: false, reason: "teplota v normě" };

  return { fan: current, reason: current ? "držím ochlazování" : "není potřeba" };
}

export function decide(state) {
  if (!state.details) state.details = [];
  state.details = [];

  const tNow = nowMs(state);
  const p = getPragueParts(tNow);

  const model = ensureBrainModel(state);
  const runtime = ensureBrainRuntime(state);
  const solarProfile = ensureSolarProfile(state);

  const isDay = !!safeGet(state, "time.isDay", safeGet(state, "world.time.isDay", true));
  const socPct = getSocPct(state);
  const { solarW, loadW, netW } = getPower(state);

  // === B 3.11 učení ze soláru ===
  // Aktualizujeme profil jen ve dne (hodiny 6..17)
  updateSolarProfile(solarProfile, p.hour, solarW, tNow);

  // Predikce zbytku soláru do západu
  const expectedSolarWh = expectedSolarWhRemaining(tNow, solarProfile);

  // runtime trend sample
  pushSample(runtime, tNow, socPct, netW);

  // trend SOC (30 min okno)
  const socTrendPH = socTrendPctPerHour(runtime, 30);

  // výdrž při aktuálním net (jen když je net záporný)
  const hoursLeftNet = (netW < 0) ? estimateHoursFromWh(state, netW) : null;

  // výdrž na baterku (vždy) = jak dlouho vydržím při současné zátěži, když solár = 0
  const hoursLeftBattery = estimateHoursFromWh(state, loadW);

  // nocní riziko: do svítání
  const toSunriseMs = msToNextSunrise(tNow, SUNRISE_H, 0);
  const toSunriseH = toSunriseMs / (1000 * 60 * 60);

  // do západu (pokud je den)
  const toSunsetMs = msToNextSunset(tNow, SUNSET_H, 0);
  const toSunsetH = toSunsetMs / (1000 * 60 * 60);

  const energyState = classifyEnergyState({ netW, socPct, hoursLeftNet }, isDay, model);

  // učení chování
  learn(model, energyState, socTrendPH, isDay, netW);

  // sampling
  const samplingMode = decideSampling(energyState, isDay, model);
  setDeviceDirectives(state, samplingMode, energyState);

  // fan
  const fanDecision = decideFan(state, energyState, socPct);
  if (!state.device) state.device = {};
  state.device.fan = fanDecision.fan;

  // message
  state.message = makeMessage(energyState, isDay, netW);

  // details (pravdivé a užitečné)
  state.details.push(`SOC: ${socPct === null ? "—" : fmt(socPct, 0) + " %"} (trend ${socTrendPH === null ? "—" : fmt(socTrendPH, 2) + " %/h"})`);
  state.details.push(`Světlo: ${fmt(safeGet(state, "world.environment.light", safeGet(state, "environment.light", 0)), 0)} lx`);
  state.details.push(`Solár: ${fmt(solarW, 3)} W`);
  state.details.push(`Zátěž: ${fmt(loadW, 3)} W`);
  state.details.push(`Net: ${fmt(netW, 2)} W`);

  // Výdrž na baterku vždy
  state.details.push(`Výdrž na baterii ~ ${hoursLeftBattery === null ? "—" : fmt(hoursLeftBattery, 2) + " h"} (při zátěži ${fmt(loadW, 3)} W)`);

  if (hoursLeftNet !== null && hoursLeftNet !== undefined) {
    state.details.push(`Výdrž při aktuálním net ~ ${fmt(hoursLeftNet, 2)} h (bez zisku)`);
  }

  // Solární predikce
  if (p.hour >= SUNSET_H) {
    state.details.push(`Dnes už solár: 0 Wh (po západu)`);
  } else if (p.hour < SUNRISE_H) {
    state.details.push(`Solár začne typicky po ${SUNRISE_H}:00 (profil učím přes den)`);
  } else {
    state.details.push(`Odhad soláru do západu ~ ${fmt(expectedSolarWh, 1)} Wh (učení z profilu)`);
    state.details.push(`Do západu ~ ${fmt(toSunsetH, 2)} h`);
  }

  state.details.push(`Režim sběru: ${samplingMode} (interval ~${state.device.collectionIntervalSec}s)`);
  state.details.push(`Větrák: ${state.device.fan ? "ZAP" : "VYP"} (${fanDecision.reason})`);

  if (!isDay) {
    state.details.push(`Do svítání ~ ${fmt(toSunriseH, 2)} h`);
    state.details.push(`Noční rezerva cílově ≥ ${fmt(model.nightReservePct, 0)} % (konzervativnost x${fmt(model.conservativeness, 2)})`);
  } else {
    state.details.push(`Konzervativnost x${fmt(model.conservativeness, 2)} • agresivita sběru ${fmt(model.samplingAggressiveness, 2)}`);
  }

  // zkušenosti – při změně stavu
  if (runtime.lastState !== energyState) {
    runtime.lastState = energyState;
    runtime.lastStateChange = tNow;

    rememberExperience(state, "energy_state_change", {
      energyState,
      isDay,
      socPct,
      netW,
      samplingMode
    });
  }

  // log rizik / kritiky
  if (energyState === "DRAINING_RISK") {
    rememberExperience(state, "energy_risk", {
      socPct,
      netW,
      hoursLeftNet,
      toSunriseH
    });
  }
  if (energyState === "CRITICAL") {
    rememberExperience(state, "energy_critical", {
      socPct,
      netW,
      hoursLeftNet
    });
  }

  // prediction pro UI
  if (!state.prediction) state.prediction = {};

  state.prediction.netW = netW;
  state.prediction.expectedSolarWh = expectedSolarWh;

  // "hoursLeft" necháme jako "bez zisku" (jen když net<0), ale přidáme hoursLeftBattery vždy
  state.prediction.hoursLeft = (netW < 0 && hoursLeftNet !== null) ? hoursLeftNet : null;
  state.prediction.hoursLeftBattery = hoursLeftBattery; // ✅ vždy
}
