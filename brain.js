import { rememberExperience } from "./memory.js";

function clamp(v, a, b) {
  return Math.max(a, Math.min(b, v));
}

function lastMs(days) {
  return days * 24 * 60 * 60 * 1000;
}

// B 3.14: simple predictions
function computePredictions(state) {
  const soc = state.device?.battery?.soc ?? 0;
  const socPct = Math.round(soc * 100);

  const batteryWh = state.device?.config?.batteryWh ?? 10;
  const loadW = state.device?.power?.loadW ?? 0.18;
  const solarW = state.device?.power?.solarInW ?? 0;

  const energyWhLeft = soc * batteryWh;
  const netW = solarW - loadW;

  // runtime if netW <= 0
  const hoursLeft = netW < 0 ? (energyWhLeft / Math.max(0.001, -netW)) : Infinity;

  // expected remaining charge today (very rough)
  // assume peak = 1.2W, remaining daylight fraction from current phase
  const now = state.time?.now ?? Date.now();
  const dayMs = 24 * 60 * 60 * 1000;
  const phase = (now % dayMs) / dayMs; // 0..1

  // daylight window approx: 0.25..0.75 (6:00..18:00)
  const daylightStart = 0.25;
  const daylightEnd = 0.75;

  let remainingDayFrac = 0;
  if (phase < daylightStart) remainingDayFrac = daylightEnd - daylightStart;
  else if (phase >= daylightStart && phase <= daylightEnd) remainingDayFrac = daylightEnd - phase;
  else remainingDayFrac = 0;

  // average sunlight ~ 0.55 * peak
  const peakW = 1.2;
  const expectedSolarWh = remainingDayFrac * 24 * (0.55 * peakW);

  return {
    socPct,
    netW: Number(netW.toFixed(3)),
    hoursLeft: hoursLeft === Infinity ? null : Number(hoursLeft.toFixed(2)),
    expectedSolarWh: Number(expectedSolarWh.toFixed(2))
  };
}

// B 3.13: learning -> conservatism
function updateLearningConservatism(state) {
  if (!state.meta) state.meta = {};

  const exp = state.memory?.experiences?.lowEnergy || [];
  const now = state.time?.now ?? Date.now();
  const since = now - lastMs(7);

  const recentLow = exp.filter(e => e.time >= since).length;

  // if lowEnergy happens a lot, be more conservative (slower sampling at night/low SOC)
  let conserv = 1;
  if (recentLow >= 6) conserv = 1.6;
  else if (recentLow >= 3) conserv = 1.3;

  state.meta.conservatism = conserv;
}

export function decide(state) {
  if (!state.device) state.device = {};
  if (!state.device.battery) state.device.battery = { soc: 0.6, voltage: 3.8 };
  if (!state.world) state.world = { environment: { temperature: 15, light: 0 } };
  if (!state.meta) state.meta = {};

  // keep power defaults (so prediction has values even before deviceTick)
  if (!state.device.power) state.device.power = { solarInW: 0, loadW: 0.18, balanceWh: 0 };

  const t = state.world.environment.temperature;
  const light = state.world.environment.light;
  const socPct = Math.round((state.device.battery.soc ?? 0) * 100);

  // learning update depends on memory (after it exists) – safe call
  updateLearningConservatism(state);

  // predictions (B 3.14)
  const pred = computePredictions(state);
  state.prediction = pred;

  // default message
  state.message = "Podmínky stabilní, sbírám data";
  state.details = [
    `SOC: ${socPct} %`,
    `Světlo: ${light} lx`,
    `Net: ${pred.netW} W`,
    pred.hoursLeft !== null ? `Výdrž ~ ${pred.hoursLeft} h (bez zisku)` : `Výdrž: ∞ (net > 0)`,
    `Dnes ještě solár ~ ${pred.expectedSolarWh} Wh`,
    `Konzervativnost: x${(state.meta.conservatism ?? 1).toFixed(1)}`
  ];

  // safety rules
  if (t > 40) {
    state.device.fan = true;
    state.message = "Přehřátí! Zapínám ventilátor";
    rememberExperience(state, "overheating", { t: Number(t.toFixed(2)), soc: socPct });
    return;
  }

  if (socPct < 10) {
    state.device.fan = false;
    state.message = "Nízká energie – šetřím systém";
    rememberExperience(state, "lowEnergy", { soc: socPct });
    return;
  }

  // risk management
  if (t > 33 && socPct < 20) {
    state.device.fan = false;
    state.message = "Teplo, ale energie málo – riskuji bez ventilátoru";
    rememberExperience(state, "riskyDecision", {
      t: Number(t.toFixed(2)),
      soc: socPct,
      decision: "no_fan_save_energy"
    });
    return;
  }

  // proactive: pokud predikce říká, že výdrž je hodně nízká a zároveň je noc, “šetři”
  if (!state.time?.isDay && pred.hoursLeft !== null && pred.hoursLeft < 6) {
    state.device.fan = false;
    state.message = "Predikce: v noci nevydržím dlouho – zpomaluji a šetřím";
    rememberExperience(state, "lowEnergyRisk", { hoursLeft: pred.hoursLeft, soc: socPct });
    return;
  }

  state.device.fan = false;
}
