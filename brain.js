// brain.js
import { estimateBatteryCapacityWh, getSocPercent } from "./energy.js";
import { rememberExperience } from "./memory.js";
import { sunsetSunriseForPrague, remainingNightHours, remainingHoursToSunset, remainingHoursToSunriseNext } from "./luxSunset.js";
import { computeFeltTemp } from "./world.js";
import { setHumanMessage as setMsg } from "./messages.js";

function n(x, fallback = 0) {
  const v = Number(x);
  return Number.isFinite(v) ? v : fallback;
}

function clamp(v, a, b) {
  return Math.max(a, Math.min(b, v));
}

function todayKeyPrague(ts) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Prague",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date(ts));

  const get = (type) => parts.find((p) => p.type === type)?.value;
  return `${get("year")}-${get("month")}-${get("day")}`;
}

function minuteOfDayPrague(ts) {
  const d = new Date(ts);
  // UTC -> Prague approx via Intl format parts
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Prague",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(d);
  const hh = Number(parts.find(p => p.type === "hour")?.value ?? "0");
  const mm = Number(parts.find(p => p.type === "minute")?.value ?? "0");
  return hh * 60 + mm;
}

function pNightSelectedW(mode) {
  switch (mode) {
    case "PROTECT": return 0.06;
    case "CRITICAL": return 0.08;
    case "CAUTION": return 0.11;
    case "NORMAL":
    default: return 0.18;
  }
}

function tightenMode(mode) {
  if (mode === "NORMAL") return "CAUTION";
  if (mode === "CAUTION") return "CRITICAL";
  if (mode === "CRITICAL") return "PROTECT";
  return mode;
}

function modeFromSoc(soc) {
  if (soc < 7) return "PROTECT";
  if (soc < 12) return "CRITICAL";
  if (soc < 22) return "CAUTION";
  return "NORMAL";
}

function setHumanMessage(state, msg, details = []) {
  state.message = msg;
  state.details = Array.isArray(details) ? details : [String(details)];
}

function samplingFromMode(mode) {
  switch (mode) {
    case "PROTECT": return { sampling: "MIN", collectionIntervalSec: 120 };
    case "CRITICAL": return { sampling: "LOW", collectionIntervalSec: 60 };
    case "CAUTION": return { sampling: "NORMAL", collectionIntervalSec: 30 };
    case "NORMAL":
    default: return { sampling: "HIGH", collectionIntervalSec: 15 };
  }
}

function computeLoRaFlags(state, nowTs, mode) {
  const dayKey = todayKeyPrague(nowTs);
  state._runtime = state._runtime || {};
  state._runtime.lora = state._runtime.lora || {};
  const rt = state._runtime.lora;

  const nowMin = minuteOfDayPrague(nowTs);
  const dueDaily = (rt.lastDailyKey !== dayKey) && nowMin >= (12 * 60);

  const urgent = (mode === "CRITICAL" || mode === "PROTECT");

  if (dueDaily) rt.lastDailyKey = dayKey;

  return {
    urgent,
    dailySummaryDue: dueDaily,
    policy: {
      sendOnlyWhen: "CRITICAL/PROTECT + dailySummary",
      dailyAfterLocalMinute: 12 * 60,
    }
  };
}

function computeNightBudget(state, env, nowTs, modeInitial) {
  const reserveFactor = 0.25;

  const capacityWh = estimateBatteryCapacityWh(state);
  const soc = getSocPercent(state);

  const batteryWh = (clamp(soc, 0, 100) / 100) * capacityWh;
  const batteryWhAt5 = 0.05 * capacityWh;
  const availableWh = Math.max(0, batteryWh - batteryWhAt5);

  const remNightH = remainingNightHours(nowTs, env?.sun);
  if (remNightH === null) {
    return {
      ok: false,
      reason: "chybí sunrise/sunset",
      reserveFactor,
      battery: { capacityWh, socPercent: soc, batteryWh, batteryWhAt5, availableWh },
    };
  }

  let mode = modeInitial;
  for (let step = 0; step < 2; step++) {
    const pNightW = pNightSelectedW(mode);
    const nightNeedWh = remNightH * pNightW;
    const reserveWh = nightNeedWh * reserveFactor;
    const totalNightBudgetWh = nightNeedWh + reserveWh;

    const coveragePct = totalNightBudgetWh > 0 ? (availableWh / totalNightBudgetWh) * 100 : 0;
    const deficitWh = Math.max(0, totalNightBudgetWh - availableWh);

    const forceCritical = availableWh < nightNeedWh;
    const shouldTighten = coveragePct < 100;

    if (mode !== "PROTECT") {
      if (forceCritical && mode !== "CRITICAL") {
        mode = "CRITICAL";
        continue;
      }
      if (shouldTighten) {
        const tightened = tightenMode(mode);
        if (tightened !== mode) {
          mode = tightened;
          continue;
        }
      }
    }

    return {
      ok: true,
      reserveFactor,
      pNightSelectedW: pNightW,
      remainingNightHours: Math.round(remNightH * 100) / 100,
      nightNeedWh: Math.round(nightNeedWh * 100) / 100,
      reserveWh: Math.round(reserveWh * 100) / 100,
      totalNightBudgetWh: Math.round(totalNightBudgetWh * 100) / 100,
      availableWh: Math.round(availableWh * 100) / 100,
      coveragePct: Math.round(coveragePct * 10) / 10,
      deficitWh: Math.round(deficitWh * 100) / 100,
      overrides: {
        forcedCritical: !!forceCritical,
        tightened: shouldTighten && (modeInitial === "NORMAL" || modeInitial === "CAUTION"),
      },
      battery: { capacityWh, socPercent: soc, batteryWh, batteryWhAt5, availableWh },
      selectedMode: mode,
    };
  }

  return {
    ok: false,
    reason: "iterace selhala",
    reserveFactor,
    battery: { capacityWh, socPercent: soc, batteryWh, batteryWhAt5, availableWh },
  };
}

// ---- MAIN BRAIN TICK ----
export function brainTick(state, dtMs = 1000) {
  const nowTs = n(state?.time?.now, Date.now());

  state.world = state.world || {};
  state.world.environment = state.world.environment || {};
  const env = state.world.environment;

  // sun model
  env.sun = env.sun || sunsetSunriseForPrague(nowTs);

  // felt temp helper
  env.feltTempC = computeFeltTemp(env);

  // sources
  const soc = getSocPercent(state);
  const socFloor = 5;

  const boxT = n(env.boxTempC, n(state?.device?.temperature, 0));
  const severeOverheat = boxT >= 55;

  // base mode from SOC
  let socMode = modeFromSoc(soc);

  // risk model (simple)
  let risk = 0;
  if (soc < 10) risk += 30;
  if (soc < 7) risk += 40;
  if (severeOverheat) risk += 30;
  risk = clamp(risk, 0, 100);

  // sunset/sunrise remaining times
  const hToSunset = remainingHoursToSunset(nowTs, env?.sun);
  const hToSunriseNext = remainingHoursToSunriseNext(nowTs, env?.sun);

  // compute night budget (iterative)
  const nb = computeNightBudget(state, env, nowTs, socMode);

  // select mode = nb.selectedMode when ok else socMode
  let selectedMode = nb.ok ? (nb.selectedMode || socMode) : socMode;

  // fan policy
  let fan = false;
  if (boxT > 42) fan = true;
  if (selectedMode === "PROTECT" || selectedMode === "CRITICAL") fan = false;
  if (severeOverheat) fan = true;

  // experiences
  if (severeOverheat) rememberExperience(state, "box_overheat", { boxTempC: boxT, soc });
  if (soc < 8) rememberExperience(state, "energy_critical", { soc });
  if (env.thunder) rememberExperience(state, "storm_thunder", { windMs: n(env.windMs, 0), rainMmH: n(env.rainMmH, 0) });
  if (env.snowing) rememberExperience(state, "snowing", { snowDepthCm: n(env.snowDepthCm, 0), airTempC: n(env.airTempC, 0) });

  // sampling policy
  const pol = samplingFromMode(selectedMode);

  // LoRa future flags
  const lora = computeLoRaFlags(state, nowTs, selectedMode);

  // apply outputs
  state.device = state.device || {};
  state.device.fan = !!fan;
  state.device.power = state.device.power || {};
  state.device.power.collectionIntervalSec = pol.collectionIntervalSec;

  // solar remaining (optional)
  const solarLeftWh = env?.solarLeftWh ?? null;

  // ---- brain diagnostics ----
  state.brain = {
    version: "B 3.36.1",
    mode: selectedMode,
    modeSoc: socMode,
    risk,
    fan: !!fan,
    battery: {
      socPercent: Math.round(soc),
      socFloorPercent: Math.round(socFloor),
      hours: Math.round((estimateBatteryCapacityWh(state) > 0 ? ((soc / 100) * estimateBatteryCapacityWh(state)) : 0) * 10) / 10,
      capacityWh: Math.round(estimateBatteryCapacityWh(state) * 100) / 100,
      planningFloorSocPercent: 5,
    },
    nightBudget: nb.ok ? {
      ok: true,
      coveragePct: Math.round(n(nb.coveragePct, 0)),
      deficitWh: Math.round(n(nb.deficitWh, 0) * 10) / 10,
      remainingNightHours: Math.round(n(nb.remainingNightHours, 0) * 10) / 10,
      pNightSelectedW: Math.round(n(nb.pNightSelectedW, 0) * 1000) / 1000,
      nightNeedWh: Math.round(n(nb.nightNeedWh, 0) * 10) / 10,
      reserveWh: Math.round(n(nb.reserveWh, 0) * 10) / 10,
      totalNightBudgetWh: Math.round(n(nb.totalNightBudgetWh, 0) * 10) / 10,
      availableWh: Math.round(n(nb.availableWh, 0) * 10) / 10,

      // ✅ FIX (pro UI): přidej i "Baterie" a "Pod 5%" přímo na top-level nightBudget
      batteryWh: Math.round(n((nb.battery && nb.battery.batteryWh), n(nb.batteryWh, 0)) * 10) / 10,
      batteryWhAt5: Math.round(n((nb.battery && nb.battery.batteryWhAt5), n(nb.batteryWhAt5, 0)) * 10) / 10,

      overrides: nb.overrides || {},
      selectedMode: nb.selectedMode || selectedMode,
    } : {
      ok: false,
      reason: nb.reason || "nelze spočítat",
    },
    solar: {
      solarPotentialW: n(env.solarPotentialW, 0),
      irradianceWm2: n(env.irradianceWm2, 0),
      untilSunsetWh: solarLeftWh === null ? null : Math.round(solarLeftWh * 100) / 100,
    },
    time: {
      hoursToSunset: hToSunset === null ? null : Math.round(Math.max(0, hToSunset) * 10) / 10,
      hoursToSunrise: hToSunriseNext === null ? null : Math.round(Math.max(0, hToSunriseNext) * 10) / 10,
    },
    temps: {
      airTempC: Math.round(n(env.airTempC, 0) * 10) / 10,
      boxTempC: Math.round(boxT * 10) / 10,
      feltTempC: Math.round(n(env.feltTempC, n(env.airTempC, 0)) * 10) / 10,
    },
    weather: {
      windMs: Math.round(n(env.windMs, 0) * 10) / 10,
      raining: !!env.raining,
      rainMmH: Math.round(n(env.rainMmH, 0) * 10) / 10,
      thunder: !!env.thunder,
      snowing: !!env.snowing,
      snowDepthCm: Math.round(n(env.snowDepthCm, 0) * 10) / 10,
      events: env.events || {},
    },
    sampling: pol.sampling,
    lora,
  };

  // message
  const details = [];
  details.push(`SOC: ${Math.round(soc)} % (floor 5%)`);

  if (state.brain.time.hoursToSunset !== null) details.push(`Do západu: ${state.brain.time.hoursToSunset} h`);
  if (state.brain.solar.untilSunsetWh !== null) details.push(`Do západu odhad: ~${Math.round(state.brain.solar.untilSunsetWh * 10) / 10} Wh`);

  if (state.brain.nightBudget.ok) {
    details.push(`Noční bilance: ${state.brain.nightBudget.coveragePct}%`);
    if (state.brain.nightBudget.deficitWh > 0) details.push(`Deficit: ${state.brain.nightBudget.deficitWh} Wh`);
  } else {
    details.push(`Noční bilance: nelze spočítat (${state.brain.nightBudget.reason || "—"})`);
  }

  if (selectedMode === "PROTECT") {
    setHumanMessage(state, "Jsem v režimu ochrany baterie. Nechci jít pod 5 % SOC.", details);
  } else if (selectedMode === "CRITICAL") {
    setHumanMessage(state, "Jedu kriticky úsporně, aby to bezpečně vyšlo přes noc.", details);
  } else if (selectedMode === "CAUTION") {
    setHumanMessage(state, "Šetřím energii a hlídám noční bilanci.", details);
  } else {
    setHumanMessage(state, "Podmínky jsou v normě. Baterii držím v bezpečné zóně.", details);
  }

  // keep compat message for UI older
  setMsg(state, state.message, state.details);
}
