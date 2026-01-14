// brain.js (B 3.35.0 – battery-safe mozek EIRA podle NCR18650B)
//
// Cíle:
// - Battery-safe režimy: NORMAL / CAUTION / CRITICAL / PROTECT
// - SOC prahy: CAUTION<=15%, CRITICAL<=10%, PROTECT<=5%
// - Neplánovat energii pod 5% SOC (floor)
// - NightBudget: spočítat, zda baterie pokryje zbytek noci
//   NightNeedWh = RemainingNightHours * P_NIGHT_SELECTED
//   ReserveFactor = 0.25
//   TotalNightBudgetWh = NightNeedWh + ReserveWh
//   AvailableWh = BatteryWh - BatteryWh_at_5%
//   Coverage% = AvailableWh/TotalNightBudgetWh*100
//   DeficitWh = max(0, TotalNightBudgetWh-AvailableWh)
// - NightBudget override:
//   - pokud Coverage<100%, zpřísnit režim o 1 stupeň (NORMAL→CAUTION, CAUTION→CRITICAL)
//   - pokud AvailableWh < NightNeedWh → CRITICAL okamžitě
// - Event log: enter/exit eventy režimu + anti-spam (řeší eventLog.js)
// - Budoucí LoRa: posílat jen CRITICAL/PROTECT a 1× denně souhrn (flagy v state.brain.lora)

import { rememberExperience } from "./memory.js";
import { logEvent, logTransition } from "./eventLog.js";

const TZ = "Europe/Prague";

function clamp(x, a, b) {
  return Math.max(a, Math.min(b, x));
}

function n(x, fallback = 0) {
  const v = Number(x);
  return Number.isFinite(v) ? v : fallback;
}

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

function minuteOfDayPrague(ts) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: TZ,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(new Date(ts));
  const get = (type) => parts.find((p) => p.type === type)?.value;
  const hh = Number(get("hour"));
  const mm = Number(get("minute"));
  if (!Number.isFinite(hh) || !Number.isFinite(mm)) return 0;
  return clamp(hh * 60 + mm, 0, 1439);
}

function getSocPercent(state) {
  const b = state?.device?.battery;

  if (typeof b === "number") return clamp(b, 0, 100);

  if (b && typeof b === "object") {
    if (b.soc !== undefined) {
      const soc = n(b.soc, 0);
      return clamp(soc <= 1.2 ? soc * 100 : soc, 0, 100);
    }
    if (b.percent !== undefined) return clamp(n(b.percent, 0), 0, 100);
  }

  return 0;
}

function getEnv(state) {
  const wEnv = state?.world?.environment;
  const legacy = state?.environment;

  return {
    airTempC: wEnv?.airTempC ?? wEnv?.temperature ?? legacy?.temperature,
    boxTempC: wEnv?.boxTempC ?? wEnv?.temperature ?? legacy?.temperature,
    feltTempC: wEnv?.feltTempC ?? wEnv?.temperature ?? legacy?.temperature,

    lightLux: wEnv?.light ?? legacy?.light,
    irradianceWm2: wEnv?.irradianceWm2,
    solarPotentialW: wEnv?.solarPotentialW,

    cloud: wEnv?.cloud,
    windMs: wEnv?.windMs,
    pressureHpa: wEnv?.pressureHpa,
    humidity: wEnv?.humidity ?? legacy?.humidity,

    raining: !!wEnv?.raining,
    rainMmH: wEnv?.rainMmH ?? 0,
    thunder: !!wEnv?.thunder,
    snowing: !!wEnv?.snowing,
    snowDepthCm: wEnv?.snowDepthCm ?? 0,
    visibilityM: wEnv?.visibilityM,

    events: wEnv?.events ?? {},
    cycle: wEnv?.cycle,
    sun: wEnv?.sun,
  };
}

function hoursBetween(nowTs, futureTs) {
  if (!nowTs || !futureTs) return null;
  return (futureTs - nowTs) / 3600000;
}

function estimateBatteryCapacityWh(state) {
  const capFromBattery = n(state?.device?.battery?.capacityWh, NaN);
  const capFromCfgWh = n(state?.device?.config?.batteryWh, NaN);

  const mah = n(state?.device?.config?.batteryMah, NaN);
  const nomV = n(state?.device?.config?.batteryNomV, 3.7);
  const usable = clamp(n(state?.device?.config?.batteryUsableFactor, 0.85), 0.3, 0.95);
  const capFromMah = Number.isFinite(mah) ? (mah / 1000) * nomV * usable : NaN;

  const id = state?.device?.identity || {};
  const capFromIdentity = n(id.batteryWh, NaN);

  // NCR18650B 3350mAh @ 3.6–3.7V → ~12.1 Wh (hrubě). Pro usable factor typicky ~0.85 → ~10.3 Wh.
  const fallback = 10.3;

  const capacityWh =
    Number.isFinite(capFromBattery) ? capFromBattery :
    Number.isFinite(capFromCfgWh) ? capFromCfgWh :
    Number.isFinite(capFromMah) ? capFromMah :
    Number.isFinite(capFromIdentity) ? capFromIdentity :
    fallback;

  return clamp(capacityWh, 2, 80);
}

function estimateBatteryHours(state, socPercent) {
  const loadW =
    n(state?.device?.power?.loadW, 0) ||
    (state?.device?.fan ? 0.2 : 0.05) ||
    0.12;

  const capacityWh = estimateBatteryCapacityWh(state);
  const remainingWh = (clamp(socPercent, 0, 100) / 100) * capacityWh;
  const hours = remainingWh / Math.max(0.05, loadW);
  return clamp(hours, 0, 999);
}

function estimateSolarUntilSunsetWh(state, env, nowTs) {
  const sunsetTs = env?.sun?.sunsetTs;
  if (!sunsetTs) return null;

  const hToSunset = hoursBetween(nowTs, sunsetTs);
  if (hToSunset === null) return null;
  if (hToSunset <= 0) return 0;

  const pNow = n(env.solarPotentialW, 0);
  if (pNow <= 0) return 0;

  const k = clamp(0.25 + 0.30 * Math.min(1, hToSunset / 6), 0.25, 0.55);
  return pNow * hToSunset * k;
}

function nextSunriseTs(nowTs, sun) {
  const sr = n(sun?.sunriseTs, 0);
  if (!sr) return 0;
  return sr <= nowTs ? sr + 24 * 3600000 : sr;
}

function remainingNightHours(nowTs, sun) {
  const ss = n(sun?.sunsetTs, 0);
  const srNext = nextSunriseTs(nowTs, sun);
  if (!ss || !srNext) return null;

  // den: teď < západ → zbývající noc je od západu do příštího východu
  if (nowTs < ss) {
    const h = hoursBetween(ss, srNext);
    return h === null ? null : Math.max(0, h);
  }

  // noc: teď >= západ → zbývající noc je od teď do příštího východu
  const h = hoursBetween(nowTs, srNext);
  return h === null ? null : Math.max(0, h);
}

function modeFromSoc(socPercent) {
  if (socPercent <= 5) return "PROTECT";
  if (socPercent <= 10) return "CRITICAL";
  if (socPercent <= 15) return "CAUTION";
  return "NORMAL";
}

function tightenMode(mode) {
  if (mode === "NORMAL") return "CAUTION";
  if (mode === "CAUTION") return "CRITICAL";
  return mode; // CRITICAL/PROTECT už netlačíme (PROTECT určuje SOC)
}

function pNightSelectedW(mode) {
  // Minimalistické hodnoty (simulace):
  // - NORMAL: běžný sampling
  // - CAUTION: úspornější
  // - CRITICAL: minimální provoz
  // - PROTECT: téměř vypnuto
  switch (mode) {
    case "CAUTION": return 0.085;
    case "CRITICAL": return 0.060;
    case "PROTECT": return 0.040;
    case "NORMAL":
    default: return 0.110;
  }
}

function computeNightBudget(state, env, nowTs, modeInitial) {
  const reserveFactor = 0.25;

  const capacityWh = estimateBatteryCapacityWh(state);
  const soc = getSocPercent(state);

  const batteryWh = (clamp(soc, 0, 100) / 100) * capacityWh;
  const batteryWhAt5 = 0.05 * capacityWh;
  const availableWh = Math.max(0, batteryWh - batteryWhAt5); // ✅ neplánovat pod 5%

  const remNightH = remainingNightHours(nowTs, env?.sun);
  if (remNightH === null) {
    return {
      ok: false,
      reason: "chybí sunrise/sunset",
      reserveFactor,
      battery: { capacityWh, socPercent: soc, batteryWh, batteryWhAt5, availableWh },
    };
  }

  // iterative: mode -> P -> budget -> override -> maybe recompute
  let mode = modeInitial;
  for (let step = 0; step < 2; step++) {
    const pNightW = pNightSelectedW(mode);
    const nightNeedWh = remNightH * pNightW;
    const reserveWh = nightNeedWh * reserveFactor;
    const totalNightBudgetWh = nightNeedWh + reserveWh;

    const coveragePct = totalNightBudgetWh > 0 ? (availableWh / totalNightBudgetWh) * 100 : 0;
    const deficitWh = Math.max(0, totalNightBudgetWh - availableWh);

    // override A: pokud available < potřeba bez rezervy → CRITICAL ihned (pokud nejsme PROTECT)
    const forceCritical = availableWh < nightNeedWh;

    // override B: coverage < 100 → zpřísnit o 1 stupeň (jen NORMAL/CAUTION)
    const shouldTighten = coveragePct < 100;

    // pokud by se to mělo změnit, tak iterujeme ještě jednou s novým modem
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

  // fallback (nemělo by nastat)
  return {
    ok: false,
    reason: "iterace selhala",
    reserveFactor,
    battery: { capacityWh, socPercent: soc, batteryWh, batteryWhAt5, availableWh },
  };
}

function setHumanMessage(state, msg, details = []) {
  state.message = msg;
  state.details = Array.isArray(details) ? details : [String(details)];
}

function samplingFromMode(mode) {
  // mapujeme na stávající collectionIntervalSec / intenzitu sběru
  // (hardware se neřídí zde, pouze “policy hint” pro zbytek systému)
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

  // denní souhrn: 1× denně po 12:00 lokálního času (jednoduché, deterministické)
  const nowMin = minuteOfDayPrague(nowTs);
  const dueDaily = (rt.lastDailyKey !== dayKey) && nowMin >= (12 * 60);

  const urgent = (mode === "CRITICAL" || mode === "PROTECT");

  if (dueDaily) rt.lastDailyKey = dayKey;

  return {
    urgent,                 // budoucí: poslat hned
    dailySummaryDue: dueDaily, // budoucí: poslat souhrn
    policy: {
      sendOnlyWhen: "CRITICAL/PROTECT + dailySummary",
      dailyAfterLocalMinute: 12 * 60,
      timezone: TZ,
    }
  };
}

// ✅ DŮLEŽITÉ: simulator.js importuje "decide", takže export musí existovat
export function decide(state) {
  if (!state || !state.time) return;

  const nowTs = n(state.time.now, Date.now());
  const env = getEnv(state);

  // SOC + “floor planning”
  const soc = getSocPercent(state);
  const socFloor = Math.max(5, soc);

  const batHours = estimateBatteryHours(state, socFloor);

  const hToSunset = env.sun?.sunsetTs ? hoursBetween(nowTs, env.sun.sunsetTs) : null;
  const hToSunrise = env.sun?.sunriseTs ? hoursBetween(nowTs, env.sun.sunriseTs) : null;
  let hToSunriseNext = hToSunrise;
  if (hToSunriseNext !== null && hToSunriseNext < 0 && env.sun?.sunsetTs) {
    hToSunriseNext = hToSunriseNext + 24;
  }

  const solarLeftWh = estimateSolarUntilSunsetWh(state, env, nowTs);

  // ---- battery-safe režim (SOC prahy) ----
  const socMode = modeFromSoc(soc);

  // ---- NightBudget + override ----
  const nb = computeNightBudget(state, env, nowTs, socMode);
  const selectedMode = nb.ok && nb.selectedMode ? nb.selectedMode : socMode;

  // ---- event log (enter/exit) ----
  state._runtime = state._runtime || {};
  state._runtime.batterySafe = state._runtime.batterySafe || {};
  const prevMode = state._runtime.batterySafe.prevMode || null;

  if (!prevMode) {
    logEvent(state, {
      key: "BATTERY_SAFE_MODE",
      action: "ENTER",
      level: selectedMode,
      message: `Start v režimu ${selectedMode}.`,
      meta: { soc },
    }, { minIntervalSec: 10 });
  } else if (prevMode !== selectedMode) {
    logTransition(state, "BATTERY_SAFE_MODE", prevMode, selectedMode, { soc });
  }

  state._runtime.batterySafe.prevMode = selectedMode;

  // ---- risk score (volitelná diagnostika; nemění svět) ----
  let risk = 0;

  // baterie (bezpečnostní zóna)
  if (soc < 20) risk += clamp((20 - soc) * 2.2, 0, 44);
  if (soc < 10) risk += 18;

  const boxT = n(env.boxTempC, n(env.airTempC, 0));
  if (boxT >= 45) risk += clamp((boxT - 45) * 3.0, 0, 40);
  if (boxT >= 55) risk += 25;
  if (boxT <= -10) risk += clamp((-10 - boxT) * 1.8, 0, 25);

  if (env.thunder || env.events?.storm) risk += 14;
  if (env.windMs !== undefined && n(env.windMs, 0) >= 12) risk += 10;
  if (env.events?.gust) risk += 6;
  if (env.events?.fog) risk += 4;
  if (env.snowing) risk += 4;
  if (env.raining && n(env.rainMmH, 0) >= 5) risk += 4;

  if (hToSunset !== null && hToSunset <= 1.0 && soc < 25) risk += 10;

  risk = clamp(Math.round(risk), 0, 100);

  // ---- akce: fan (ochrana + úspora) ----
  const criticalEnergy = (selectedMode === "CRITICAL" || selectedMode === "PROTECT") || soc < 8 || batHours < 4;
  const lowSolarNow = n(env.solarPotentialW, 0) < 0.05;
  const nearNight = hToSunset !== null && hToSunset < 0.6;
  const overheating = boxT >= 42;
  const severeOverheat = boxT >= 48;

  let fan = false;

  if (severeOverheat) {
    fan = !(criticalEnergy && lowSolarNow && nearNight);
  } else if (overheating) {
    fan = !criticalEnergy || !lowSolarNow || (solarLeftWh !== null && solarLeftWh > 0.5);
  } else {
    fan = false;
  }

  // ---- zkušenosti (ponecháme) ----
  if (severeOverheat) rememberExperience(state, "box_overheat", { boxTempC: boxT, soc });
  if (soc < 8) rememberExperience(state, "energy_critical", { soc, batHours });
  if (env.thunder) rememberExperience(state, "storm_thunder", { windMs: n(env.windMs, 0), rainMmH: n(env.rainMmH, 0) });
  if (env.snowing) rememberExperience(state, "snowing", { snowDepthCm: n(env.snowDepthCm, 0), airTempC: n(env.airTempC, 0) });

  // ---- sampling policy ----
  const pol = samplingFromMode(selectedMode);

  // ---- LoRa flags (budoucí) ----
  const lora = computeLoRaFlags(state, nowTs, selectedMode);

  // ---- apply outputs ----
  state.device = state.device || {};
  state.device.fan = !!fan;

  state.device.power = state.device.power || {};
  // pouze “hint”, ne hard-control: používá se v memoryTick (collectionIntervalSec)
  state.device.power.collectionIntervalSec = pol.collectionIntervalSec;

  // ---- brain diagnostics ----
  state.brain = {
    version: "B 3.35.1",
    mode: selectedMode,
    modeSoc: socMode,
    risk,
    fan: !!fan,
    battery: {
      socPercent: Math.round(soc),
      socFloorPercent: Math.round(socFloor),
      hours: Math.round(batHours * 10) / 10,
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

  // ---- lidské hlášky (EIRA styl – klidné, bezpečné) ----
  const details = [];
  details.push(`SOC: ${Math.round(soc)} % (floor 5%)`);
  details.push(`Výdrž: ${Math.round(batHours * 10) / 10} h`);

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
}
