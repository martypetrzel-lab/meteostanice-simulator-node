// brain.js (B 3.15)
// Obsahuje:
// - B 3.13: plánování "neumřít do svítání"
// - B 3.14: sezónní solární profil (EMA po hodinách podle měsíce)
// - B 3.15: Energetická identita zařízení (baterka/panel/load profily + kalibrace)
// - Trend, rizika, stavové rozhodování + učení

import { rememberExperience } from "./memory.js";

const TZ = "Europe/Prague";

// Defaultní model dne (později můžeme napojit na skutečný východ/západ)
const SUNRISE_H = 6;
const SUNSET_H = 18;

// --- Utils ---
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

function num(x, fallback = 0) {
  const n = Number(x);
  return Number.isFinite(n) ? n : fallback;
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
    m: Number(map.month), // 1..12
    d: Number(map.day),
    hour: Number(map.hour),
    minute: Number(map.minute),
    second: Number(map.second),
  };
}

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

// --- State reads ---
function getSocPct(state) {
  const socPct =
    safeGet(state, "device.socPct", null) ??
    (safeGet(state, "device.battery.soc", null) !== null ? safeGet(state, "device.battery.soc", 0) * 100 : null) ??
    safeGet(state, "device.batteryPct", null) ??
    safeGet(state, "device.battery", null);

  if (socPct === null || socPct === undefined) return null;
  return clamp(Number(socPct), 0, 100);
}

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

// --- B 3.15: Device Identity (profil zařízení + kalibrace) ---
function ensureDeviceIdentity(state) {
  if (!state.device) state.device = {};
  if (!state.device.identity) {
    // Defaulty pro simulátor (můžeš přepsat v state.json nebo později v UI)
    state.device.identity = {
      version: "B3.15",
      // baterka
      batteryCapacityWh: num(safeGet(state, "device.batteryCapacityWh", 11.1), 11.1), // fallback 1x18650 ~11Wh
      batteryMinSocPct: 5,              // nikdy nechci jít pod (kvůli životnosti)
      // panel
      panelMaxW: 1.0,                   // tvůj budoucí cíl je 5V/1W -> default 1W
      // spotřeby / režimy (odhad)
      loadNormalW: 0.18,                // typicky ESP + senzory
      loadSavingW: 0.12,                // omezený sběr, méně práce
      loadHibernateW: 0.06,             // minimální režim
      fanExtraW: 0.20,                  // ventilátor (odhad)
      // ztráty
      systemEfficiency: 0.88,           // účinnost (step-up, nabíjení, ztráty)
      // učení (EMA kalibrace)
      learned: {
        loadBaseEmaW: null,             // naučený baseline load při solar~0
        loadBaseN: 0,
        panelPeakEmaW: null,            // naučený peak panelu
        panelPeakN: 0
      }
    };
  } else {
    state.device.identity.version = "B3.15";
    if (state.device.identity.learned === undefined) {
      state.device.identity.learned = { loadBaseEmaW: null, loadBaseN: 0, panelPeakEmaW: null, panelPeakN: 0 };
    }
  }
  return state.device.identity;
}

function emaUpdate(current, x, alpha) {
  if (current === null || current === undefined || !Number.isFinite(current)) return x;
  return current + alpha * (x - current);
}

function calibrateIdentity(identity, solarW, loadW, fanOn) {
  // Učení baseline spotřeby: když solár ~0 a fan off => loadW ~ baseline
  if (solarW < 0.05 && !fanOn && loadW > 0) {
    const n = (identity.learned.loadBaseN || 0) + 1;
    identity.learned.loadBaseN = n;
    const alpha = clamp(0.35 / Math.sqrt(n), 0.03, 0.35);
    identity.learned.loadBaseEmaW = emaUpdate(identity.learned.loadBaseEmaW, loadW, alpha);
  }

  // Učení peak panelu: když solarW je vysoký (zachytit maximum)
  if (solarW > 0.2) {
    const n = (identity.learned.panelPeakN || 0) + 1;
    identity.learned.panelPeakN = n;
    const alpha = clamp(0.25 / Math.sqrt(n), 0.02, 0.25);
    // panelPeak sledujeme jako EMA maxima (přitlačíme k vyšším hodnotám)
    const target = Math.max(identity.learned.panelPeakEmaW || 0, solarW);
    identity.learned.panelPeakEmaW = emaUpdate(identity.learned.panelPeakEmaW, target, alpha);
  }

  // Pokud máme naučený baseline, zaktualizuj loadNormalW jemně (ale neresetuj ruční nastavení)
  if (identity.learned.loadBaseEmaW !== null && Number.isFinite(identity.learned.loadBaseEmaW)) {
    // přibližně: normal = baseline, saving o trochu méně, hibernate výrazně méně
    const base = identity.learned.loadBaseEmaW;
    identity.loadNormalW = emaUpdate(identity.loadNormalW, base, 0.02);
    identity.loadSavingW = emaUpdate(identity.loadSavingW, Math.max(0.05, base * 0.75), 0.02);
    identity.loadHibernateW = emaUpdate(identity.loadHibernateW, Math.max(0.03, base * 0.35), 0.02);
  }

  // Pokud máme naučený peak panelu, zaktualizuj panelMaxW jemně
  if (identity.learned.panelPeakEmaW !== null && Number.isFinite(identity.learned.panelPeakEmaW)) {
    identity.panelMaxW = emaUpdate(identity.panelMaxW, identity.learned.panelPeakEmaW, 0.01);
  }
}

// --- Battery / Wh ---
function getAvailableWh(state, identity) {
  // preferuj balanceWh (nejlepší)
  const balWh =
    safeGet(state, "device.power.balanceWh", null) ??
    safeGet(state, "device.battery.balanceWh", null) ??
    null;

  const eff = clamp(num(identity.systemEfficiency, 0.88), 0.6, 1.0);

  if (balWh !== null && balWh !== undefined) {
    // balanceWh už zpravidla odpovídá "užitečné" energii; necháme bez eff
    return Math.max(0, Number(balWh));
  }

  // fallback: capacityWh * SOC * eff
  const socPct = getSocPct(state);
  if (socPct === null) return null;

  const capWh = num(identity.batteryCapacityWh, 11.1);
  const minSoc = clamp(num(identity.batteryMinSocPct, 5), 0, 30);
  const usableSocPct = clamp(socPct - minSoc, 0, 100);

  const availWh = (capWh * usableSocPct) / 100;
  return Math.max(0, availWh * eff);
}

// "výdrž v hodinách" (z Wh / W)
function hoursFromWh(availableWh, w) {
  const denom = Math.max(0.001, Math.abs(w || 0.001));
  if (availableWh === null || availableWh === undefined) return null;
  return Number(availableWh) / denom;
}

// --- Runtime (trend) ---
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

function pushSample(runtime, t, socPct, netW) {
  runtime.samples.push({ t, socPct, netW });

  const KEEP_MS = 6 * 60 * 60 * 1000;
  const minT = t - KEEP_MS;
  runtime.samples = runtime.samples.filter(s => s.t >= minT);

  if (runtime.samples.length > 4000) {
    runtime.samples = runtime.samples.slice(runtime.samples.length - 4000);
  }
}

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

// --- Long-term model (learning knobs) ---
function ensureBrainModel(state) {
  if (!state.memory) state.memory = {};
  if (!state.memory.brainModel) {
    state.memory.brainModel = {
      version: "B3.15",
      conservativeness: 1.0,
      nightReservePct: 25,
      samplingAggressiveness: 0.55,
      // B 3.13
      sunriseSafetyMarginWh: 0.8,
      sunriseConfidenceMinN: 8,
      counters: {
        riskEvents: 0,
        criticalEvents: 0,
        deepDischargeEvents: 0,
        overheatEvents: 0
      }
    };
  } else {
    state.memory.brainModel.version = "B3.15";
    if (state.memory.brainModel.sunriseSafetyMarginWh === undefined) state.memory.brainModel.sunriseSafetyMarginWh = 0.8;
    if (state.memory.brainModel.sunriseConfidenceMinN === undefined) state.memory.brainModel.sunriseConfidenceMinN = 8;
  }
  return state.memory.brainModel;
}

// --- B 3.14 Seasonal solar profile (per month) ---
function makeEmptyHourlyBins() {
  const hours = {};
  for (let h = 0; h < 24; h++) hours[h] = { emaW: 0, n: 0, lastTs: null };
  return hours;
}

function ensureSolarProfiles(state) {
  if (!state.memory) state.memory = {};

  if (!state.memory.solarProfile) {
    state.memory.solarProfile = { version: "legacy", hours: makeEmptyHourlyBins() };
  } else if (!state.memory.solarProfile.hours) {
    state.memory.solarProfile.hours = makeEmptyHourlyBins();
  }

  if (!state.memory.solarProfilesByMonth) {
    const byMonth = {};
    for (let m = 1; m <= 12; m++) byMonth[m] = { version: "B3.14", hours: makeEmptyHourlyBins() };
    state.memory.solarProfilesByMonth = byMonth;
  } else {
    for (let m = 1; m <= 12; m++) {
      if (!state.memory.solarProfilesByMonth[m]) state.memory.solarProfilesByMonth[m] = { version: "B3.14", hours: makeEmptyHourlyBins() };
      if (!state.memory.solarProfilesByMonth[m].hours) state.memory.solarProfilesByMonth[m].hours = makeEmptyHourlyBins();
    }
  }

  return {
    global: state.memory.solarProfile,
    byMonth: state.memory.solarProfilesByMonth
  };
}

function updateSolarBin(bin, solarW, ts) {
  const n = (bin.n || 0) + 1;
  bin.n = n;

  const alpha = clamp(0.25 / Math.sqrt(n), 0.03, 0.25);
  bin.emaW = (n === 1) ? solarW : (bin.emaW + alpha * (solarW - bin.emaW));
  bin.lastTs = ts;
}

function updateSolarProfiles(profiles, month, hour, solarW, ts) {
  if (hour < SUNRISE_H || hour >= SUNSET_H) return;

  const mBin = profiles.byMonth?.[month]?.hours?.[hour];
  const gBin = profiles.global?.hours?.[hour];

  if (mBin) updateSolarBin(mBin, solarW, ts);
  if (gBin) updateSolarBin(gBin, solarW, ts);
}

function expectedSolarWhRemaining(ts, profileHours) {
  const p = getPragueParts(ts);
  if (p.hour >= SUNSET_H) return 0;

  const nowMin = p.hour * 60 + p.minute + p.second / 60;
  const sunsetMin = SUNSET_H * 60;

  let wh = 0;

  for (let h = p.hour; h < SUNSET_H; h++) {
    const bin = profileHours?.[h];
    const emaW = bin ? Number(bin.emaW || 0) : 0;

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

function profileConfidence(profileHours, hourFrom = SUNRISE_H, hourTo = SUNSET_H - 1) {
  let sum = 0;
  let cnt = 0;
  for (let h = hourFrom; h <= hourTo; h++) {
    const n = Number(profileHours?.[h]?.n || 0);
    sum += n;
    cnt += 1;
  }
  return cnt ? (sum / cnt) : 0;
}

// --- B 3.13 Sunrise survival planning ---
function sunrisePlan(identityAvailWh, model, loadW, isDay, tNow) {
  const toSunriseMs = msToNextSunrise(tNow, SUNRISE_H, 0);
  const toSunriseH = toSunriseMs / (1000 * 60 * 60);

  const neededWh = Math.max(0, Number(loadW) * toSunriseH);
  const marginWh = Number(model.sunriseSafetyMarginWh || 0.8);
  const targetWh = neededWh + marginWh;

  const willSurvive = (identityAvailWh === null) ? null : (identityAvailWh >= targetWh);
  const deficitWh = (identityAvailWh === null) ? null : Math.max(0, targetWh - identityAvailWh);
  const bufferWh = (identityAvailWh === null) ? null : (identityAvailWh - neededWh);

  return {
    availWh: identityAvailWh,
    toSunriseH,
    neededWh,
    marginWh,
    targetWh,
    willSurvive,
    deficitWh,
    bufferWh,
    isCriticalWindow: !isDay
  };
}

// --- Classification and actions ---
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

function decideSampling(energyState, isDay, model, sunriseRiskBoost = 0) {
  const a = clamp(model.samplingAggressiveness, 0, 1);

  let mode;
  switch (energyState) {
    case "POSITIVE":
      mode = a > 0.6 ? "HIGH" : "NORMAL";
      break;
    case "BALANCED":
      mode = "NORMAL";
      break;
    case "DRAINING_SAFE":
      mode = isDay ? "NORMAL" : "LOW";
      break;
    case "DRAINING_RISK":
      mode = "ULTRA_LOW";
      break;
    case "CRITICAL":
    default:
      mode = "HIBERNATE";
      break;
  }

  if (sunriseRiskBoost >= 2) {
    mode = "HIBERNATE";
  } else if (sunriseRiskBoost === 1) {
    if (mode === "HIGH") mode = "NORMAL";
    else if (mode === "NORMAL") mode = "LOW";
    else if (mode === "LOW") mode = "ULTRA_LOW";
    else if (mode === "ULTRA_LOW") mode = "HIBERNATE";
  }

  return mode;
}

function learn(model, energyState, socTrendPH, isDay, netW, sunrise) {
  const c = model.counters;

  if (energyState === "DRAINING_RISK") c.riskEvents += 1;
  if (energyState === "CRITICAL") c.criticalEvents += 1;

  if (sunrise?.isCriticalWindow && sunrise?.willSurvive === false) {
    model.conservativeness = clamp(model.conservativeness + 0.01, 0.7, 1.6);
    model.nightReservePct = clamp(model.nightReservePct + 0.2, 10, 50);
    model.samplingAggressiveness = clamp(model.samplingAggressiveness - 0.01, 0, 1);
    model.sunriseSafetyMarginWh = clamp(num(model.sunriseSafetyMarginWh, 0.8) + 0.02, 0.2, 3.0);
  }

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
    model.sunriseSafetyMarginWh = clamp(num(model.sunriseSafetyMarginWh, 0.8) + 0.05, 0.2, 3.0);
    c.criticalEvents = 0;
  }
}

function makeMessage(energyState, isDay, netW, sunrise) {
  const sign = netW >= 0 ? "+" : "";
  const netTxt = `${sign}${fmt(netW, 2)} W`;

  if (sunrise?.isCriticalWindow && sunrise?.willSurvive === false) {
    const deficit = sunrise.deficitWh === null ? "—" : fmt(sunrise.deficitWh, 2);
    return `KRITICKÉ RIZIKO: nedožiju se svítání (chybí ~${deficit} Wh)`;
  }

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

function setDeviceDirectives(state, samplingMode, energyState, sunriseHardRisk) {
  if (!state.device) state.device = {};

  state.device.samplingMode = samplingMode;
  state.device.savingMode = ["DRAINING_RISK", "CRITICAL"].includes(energyState) || sunriseHardRisk;

  const interval =
    samplingMode === "HIGH" ? 5 :
    samplingMode === "NORMAL" ? 10 :
    samplingMode === "LOW" ? 20 :
    samplingMode === "ULTRA_LOW" ? 60 :
    180;

  state.device.collectionIntervalSec = interval;
}

function decideFan(state, energyState, socPct, sunriseHardRisk) {
  const t = num(
    safeGet(state, "world.environment.temperature",
      safeGet(state, "environment.temperature",
        safeGet(state, "device.temperature", 0)
      )
    ),
    0
  );

  if (sunriseHardRisk && t < 35) return { fan: false, reason: "šetřím energii (přežít do svítání)" };
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

// --- MAIN ---
export function decide(state) {
  if (!state.details) state.details = [];
  state.details = [];

  const tNow = nowMs(state);
  const p = getPragueParts(tNow);
  const month = p.m;

  const model = ensureBrainModel(state);
  const runtime = ensureBrainRuntime(state);

  const isDay = !!safeGet(state, "time.isDay", safeGet(state, "world.time.isDay", true));
  const socPct = getSocPct(state);
  const { solarW, loadW, netW } = getPower(state);

  // B 3.15 identity + kalibrace
  const identity = ensureDeviceIdentity(state);
  const fanOnNow = !!safeGet(state, "device.fan", false);
  calibrateIdentity(identity, solarW, loadW, fanOnNow);

  // sezónní profily
  const profiles = ensureSolarProfiles(state);
  updateSolarProfiles(profiles, month, p.hour, solarW, tNow);

  const monthHours = profiles.byMonth?.[month]?.hours;
  const globalHours = profiles.global?.hours;

  const confMonth = profileConfidence(monthHours);
  const confGlobal = profileConfidence(globalHours);

  const useMonth = confMonth >= num(model.sunriseConfidenceMinN, 8);
  const usedProfileHours = useMonth ? monthHours : globalHours;

  const expectedSolarWh = expectedSolarWhRemaining(tNow, usedProfileHours);

  // runtime trend
  pushSample(runtime, tNow, socPct, netW);
  const socTrendPH = socTrendPctPerHour(runtime, 30);

  // dostupná energie (Wh) podle identity (minSoC, efficiency)
  const availWh = getAvailableWh(state, identity);

  // výdrž při aktuálním net (jen když net < 0)
  const hoursLeftNet = (netW < 0 && availWh !== null) ? hoursFromWh(availWh, netW) : null;

  // výdrž baterie při aktuální zátěži (vždy)
  const hoursLeftBatteryNow = (availWh !== null) ? hoursFromWh(availWh, loadW) : null;

  // B 3.15: výdrže podle režimů (identity load profily)
  const hoursLeftBatterySaving = (availWh !== null) ? hoursFromWh(availWh, identity.loadSavingW) : null;
  const hoursLeftBatteryHibernate = (availWh !== null) ? hoursFromWh(availWh, identity.loadHibernateW) : null;

  // časy do svítání / západu
  const toSunriseH = msToNextSunrise(tNow, SUNRISE_H, 0) / (1000 * 60 * 60);
  const toSunsetH = msToNextSunset(tNow, SUNSET_H, 0) / (1000 * 60 * 60);

  // B 3.13: plán do svítání — ale použijeme load podle toho, jaký režim plánujeme
  // Pro predikci přežití bereme "aktuální load", ale pokud už savingMode běží, ber saving load.
  const effectiveLoadForPlan = safeGet(state, "device.savingMode", false) ? identity.loadSavingW : loadW;
  const sunrise = sunrisePlan(availWh, model, effectiveLoadForPlan, isDay, tNow);

  // klasifikace
  let energyState = classifyEnergyState({ netW, socPct, hoursLeftNet }, isDay, model);

  const sunriseHardRisk = (sunrise.isCriticalWindow && sunrise.willSurvive === false);
  const sunriseSoftRisk =
    sunrise.isCriticalWindow &&
    sunrise.willSurvive !== null &&
    sunrise.willSurvive === true &&
    sunrise.bufferWh !== null &&
    sunrise.bufferWh < num(model.sunriseSafetyMarginWh, 0.8) * 0.6;

  if (sunriseHardRisk) {
    energyState = "CRITICAL";
  } else if (sunriseSoftRisk) {
    if (energyState === "DRAINING_SAFE" || energyState === "BALANCED" || energyState === "POSITIVE") {
      energyState = "DRAINING_RISK";
    }
  }

  // učení
  learn(model, energyState, socTrendPH, isDay, netW, sunrise);

  // sampling: boost podle sunrise risk
  const sunriseRiskBoost = sunriseHardRisk ? 2 : (sunriseSoftRisk ? 1 : 0);
  const samplingMode = decideSampling(energyState, isDay, model, sunriseRiskBoost);

  setDeviceDirectives(state, samplingMode, energyState, sunriseHardRisk);

  // fan rozhodnutí (po setDeviceDirectives)
  const fanDecision = decideFan(state, energyState, socPct, sunriseHardRisk);
  state.device.fan = fanDecision.fan;

  // message
  state.message = makeMessage(energyState, isDay, netW, sunrise);

  // details (UI)
  state.details.push(`SOC: ${socPct === null ? "—" : fmt(socPct, 0) + " %"} (trend ${socTrendPH === null ? "—" : fmt(socTrendPH, 2) + " %/h"})`);
  state.details.push(`Solár: ${fmt(solarW, 3)} W • Zátěž: ${fmt(loadW, 3)} W • Net: ${fmt(netW, 2)} W`);

  // B 3.15 identita (viditelně)
  state.details.push(`Profil zařízení: baterie ${fmt(identity.batteryCapacityWh, 2)} Wh (min SOC ${fmt(identity.batteryMinSocPct, 0)}%) • panel max ~${fmt(identity.panelMaxW, 2)} W • účinnost ${fmt(identity.systemEfficiency, 2)}`);

  if (identity.learned.loadBaseEmaW !== null) {
    state.details.push(`Kalibrace: baseline load ~${fmt(identity.learned.loadBaseEmaW, 3)} W (n=${identity.learned.loadBaseN || 0})`);
  }
  if (identity.learned.panelPeakEmaW !== null) {
    state.details.push(`Kalibrace: peak solár ~${fmt(identity.learned.panelPeakEmaW, 3)} W (n=${identity.learned.panelPeakN || 0})`);
  }

  // Výdrž baterie (vždy) + režimy
  state.details.push(`Výdrž baterie (teď) ~ ${hoursLeftBatteryNow === null ? "—" : fmt(hoursLeftBatteryNow, 2)} h`);
  state.details.push(`Výdrž baterie (šetření) ~ ${hoursLeftBatterySaving === null ? "—" : fmt(hoursLeftBatterySaving, 2)} h • (hibernace) ~ ${hoursLeftBatteryHibernate === null ? "—" : fmt(hoursLeftBatteryHibernate, 2)} h`);

  if (hoursLeftNet !== null && hoursLeftNet !== undefined) {
    state.details.push(`Výdrž při aktuálním net (bez zisku) ~ ${fmt(hoursLeftNet, 2)} h`);
  }

  // solární predikce + confidence
  if (p.hour >= SUNSET_H) {
    state.details.push(`Dnes už solár: 0 Wh (po západu)`);
  } else if (p.hour < SUNRISE_H) {
    state.details.push(`Solár začne typicky po ${SUNRISE_H}:00 (profil učím přes den)`);
  } else {
    const profTxt = useMonth ? `měsíční (M${month})` : "globální";
    state.details.push(`Odhad soláru do západu ~ ${fmt(expectedSolarWh, 1)} Wh (${profTxt} profil)`);
    state.details.push(`Důvěra profilu: měsíc ${fmt(confMonth, 1)} vz/h • globál ${fmt(confGlobal, 1)} vz/h`);
    state.details.push(`Do západu ~ ${fmt(toSunsetH, 2)} h`);
  }

  // plán do svítání
  state.details.push(`Do svítání ~ ${fmt(sunrise.toSunriseH, 2)} h`);
  state.details.push(`Plán do svítání: potřeba ~${fmt(sunrise.neededWh, 2)} Wh + rezerva ${fmt(sunrise.marginWh, 2)} Wh • k dispozici ${sunrise.availWh === null ? "—" : fmt(sunrise.availWh, 2)} Wh • výsledek: ${sunrise.willSurvive === null ? "—" : (sunrise.willSurvive ? "OK" : "RIZIKO")}`);

  state.details.push(`Režim sběru: ${samplingMode} (interval ~${state.device.collectionIntervalSec}s) • Šetření: ${state.device.savingMode ? "ANO" : "NE"}`);
  state.details.push(`Větrák: ${state.device.fan ? "ZAP" : "VYP"} (${fanDecision.reason})`);
  state.details.push(`Noční rezerva cílově ≥ ${fmt(model.nightReservePct, 0)} % (konzervativnost x${fmt(model.conservativeness, 2)})`);

  // experiences – změna stavu
  if (runtime.lastState !== energyState) {
    runtime.lastState = energyState;
    runtime.lastStateChange = tNow;

    rememberExperience(state, "energy_state_change", {
      energyState,
      isDay,
      socPct,
      netW,
      samplingMode,
      sunriseWillSurvive: sunrise.willSurvive
    });
  }

  if (sunriseHardRisk) {
    rememberExperience(state, "sunrise_risk_hard", {
      socPct,
      loadW: effectiveLoadForPlan,
      toSunriseH: sunrise.toSunriseH,
      availWh: sunrise.availWh,
      targetWh: sunrise.targetWh,
      deficitWh: sunrise.deficitWh
    });
  } else if (sunriseSoftRisk) {
    rememberExperience(state, "sunrise_risk_soft", {
      socPct,
      loadW: effectiveLoadForPlan,
      toSunriseH: sunrise.toSunriseH,
      availWh: sunrise.availWh,
      bufferWh: sunrise.bufferWh
    });
  }

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

  // bez zisku (jen pokud net < 0)
  state.prediction.hoursLeft = (netW < 0 && hoursLeftNet !== null) ? hoursLeftNet : null;

  // vždy: výdrž baterie
  state.prediction.hoursLeftBattery = hoursLeftBatteryNow;

  // B 3.15: výdrže v režimech
  state.prediction.hoursLeftBatterySaving = hoursLeftBatterySaving;
  state.prediction.hoursLeftBatteryHibernate = hoursLeftBatteryHibernate;

  // do svítání
  state.prediction.toSunriseH = sunrise.toSunriseH;
  state.prediction.sunriseWillSurvive = sunrise.willSurvive;
  state.prediction.sunriseDeficitWh = sunrise.deficitWh;

  // profil
  state.prediction.solarProfile = {
    month,
    used: useMonth ? "month" : "global",
    confidenceMonth: confMonth,
    confidenceGlobal: confGlobal
  };

  // identita (pro debug / budoucí UI)
  state.prediction.identity = {
    batteryCapacityWh: identity.batteryCapacityWh,
    panelMaxW: identity.panelMaxW,
    loadNormalW: identity.loadNormalW,
    loadSavingW: identity.loadSavingW,
    loadHibernateW: identity.loadHibernateW,
    systemEfficiency: identity.systemEfficiency,
    learned: identity.learned
  };
}
