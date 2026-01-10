// brain.js (B 3.22)
// Mozek napojený na svět: používá východ/západ, trend soláru, riziko a nastavuje sampling.
// Pozn.: oprava výpočtu výdrže – nyní bere kapacitu z device.battery.capacityWh (realističtější pro HW).

import { rememberExperience } from "./memory.js";

function clamp(x, a, b) {
  return Math.max(a, Math.min(b, x));
}

function n(x, fallback = 0) {
  const v = Number(x);
  return Number.isFinite(v) ? v : fallback;
}

function safeEnv(state) {
  const wEnv = state?.world?.environment || {};
  return {
    airTempC: wEnv?.airTempC ?? wEnv?.temperature ?? 0,
    groundTempC: wEnv?.groundTempC ?? 0,
    feltTempC: wEnv?.feltTempC ?? 0,
    boxTempC: wEnv?.boxTempC ?? wEnv?.temperature ?? 0,
    boxTargetTempC: wEnv?.boxTargetTempC ?? 0,
    humidity: wEnv?.humidity ?? 50,
    pressureHpa: wEnv?.pressureHpa ?? 1013,
    windMs: wEnv?.windMs ?? 0,
    cloud: wEnv?.cloud ?? 0,
    raining: !!wEnv?.raining,
    rainMmH: wEnv?.rainMmH ?? 0,
    thunder: !!wEnv?.thunder,
    snowing: !!wEnv?.snowing,
    snowDepthCm: wEnv?.snowDepthCm ?? 0,
    visibilityM: wEnv?.visibilityM,
    events: wEnv?.events ?? {},
    cycle: wEnv?.cycle,
    sun: wEnv?.sun,
    light: wEnv?.light ?? 0,
    irradianceWm2: wEnv?.irradianceWm2 ?? 0,
  };
}

function hoursBetween(nowTs, futureTs) {
  if (!nowTs || !futureTs) return null;
  const dt = (futureTs - nowTs) / 3600000;
  return dt;
}

function estimateBatteryHours(state, socPercent) {
  // Load (W): pokud má zařízení přesnou zátěž (už včetně step-up ztrát), použijeme ji.
  const loadW_raw = n(state?.device?.power?.loadW, 0);

  // Fallback, když loadW není k dispozici
  const loadW_fallback =
    (state?.device?.fan ? 1.2 : 0) + // hrubý odhad „fan ON“ pokud nemáme power model
    0.18; // ESP32 + senzory

  const loadW = loadW_raw > 0.01 ? loadW_raw : loadW_fallback;

  // Kapacita baterie (Wh) – preferujeme reálnější zdroje:
  // 1) device.battery.capacityWh (počítá device.js podle config / mAh)
  // 2) device.config.batteryWh
  // 3) device.config (mAh * V * usableFactor)
  // 4) device.identity.batteryWh (legacy)
  const capFromBattery = n(state?.device?.battery?.capacityWh, NaN);
  const capFromCfgWh = n(state?.device?.config?.batteryWh, NaN);

  const mah = n(state?.device?.config?.batteryMah, NaN);
  const nomV = n(state?.device?.config?.batteryNomV, 3.7);
  const usable = clamp(n(state?.device?.config?.batteryUsableFactor, 0.8), 0.3, 0.95);
  const capFromMah = Number.isFinite(mah) ? (mah / 1000) * nomV * usable : NaN;

  const capFromIdentity = n(state?.device?.identity?.batteryWh, NaN);

  const capacityWh = clamp(
    (Number.isFinite(capFromBattery) ? capFromBattery :
     Number.isFinite(capFromCfgWh) ? capFromCfgWh :
     Number.isFinite(capFromMah) ? capFromMah :
     Number.isFinite(capFromIdentity) ? capFromIdentity :
     6.5),
    2, 80
  );

  const remainingWh = (clamp(socPercent, 0, 100) / 100) * capacityWh;
  const hours = remainingWh / Math.max(0.05, loadW);
  return clamp(hours, 0, 999);
}

function estimateUntilSunsetSolarWh(state) {
  const now = n(state?.time?.now, Date.now());
  const sun = state?.world?.environment?.sun || {};
  const sunsetTs = n(sun?.sunsetTs, 0);
  if (!sunsetTs || sunsetTs <= now) return null;

  // pokud device.power.solarInW existuje, vezmeme aktuální výkon jako jednoduchý odhad,
  // jinak fallback na 0
  const solarNowW = n(state?.device?.power?.solarInW, 0);

  const h = hoursBetween(now, sunsetTs);
  if (!Number.isFinite(h)) return null;

  // jednoduchý odhad: „kdyby to drželo současný výkon“
  const wh = solarNowW * h;
  return wh;
}

export function brainTick(state) {
  if (!state.brain) state.brain = {};

  const now = n(state?.time?.now, Date.now());
  const env = safeEnv(state);

  // SOC percent (prefer device.battery.percent)
  const socPercent =
    n(state?.device?.battery?.percent, NaN) ||
    Math.round(n(state?.device?.battery?.soc, 0) * 100);

  // Výdrž (opraveno)
  const hours = estimateBatteryHours(state, socPercent);

  // Odhad soláru do západu (Wh)
  const untilSunsetWh = estimateUntilSunsetSolarWh(state);

  // Riziko: zjednodušeně podle SOC a toho, jestli je noc / málo soláru
  const isDay = !!state?.time?.isDay;
  const solarW = n(state?.device?.power?.solarInW, 0);
  const loadW = n(state?.device?.power?.loadW, 0.2);

  let risk = 0;
  if (!isDay && socPercent < 25) risk += 45;
  if (!isDay && socPercent < 15) risk += 30;
  if (isDay && solarW < 0.05 && socPercent < 30) risk += 20;
  if (loadW > 1.0 && socPercent < 40) risk += 15;
  risk = clamp(risk, 0, 100);

  // Sampling režim (pro sběr dat) – jednoduchá logika
  let sampling = "normal";
  if (socPercent >= 55 && (isDay || untilSunsetWh > 0)) sampling = "learn";
  if (socPercent < 25) sampling = "safe";

  // zpráva pro UI
  let message = "—";
  if (sampling === "learn") message = "Podmínky vypadají dobře. Můžu si dovolit sbírat víc dat a učit se.";
  if (sampling === "normal") message = "Běžný režim. Sbírám data s rozumnou frekvencí.";
  if (sampling === "safe") message = "Šetřím energii. Snižuji frekvenci sběru dat, abych přežil.";

  // zapis do state
  state.brain.risk = Math.round(risk);
  state.brain.mode = sampling.toUpperCase();
  state.brain.sampling = sampling;

  state.brain.battery = {
    socPercent: Math.round(socPercent),
    hours: Math.round(hours * 10) / 10,
  };

  state.brain.solar = {
    untilSunsetWh: Number.isFinite(untilSunsetWh) ? Math.round(untilSunsetWh * 10) / 10 : null,
  };

  state.message = message;

  // detail řádky pro UI
  const sun = env.sun || {};
  const sunsetTs = n(sun?.sunsetTs, 0);
  const toSunsetH = sunsetTs ? hoursBetween(now, sunsetTs) : null;

  state.details = [
    `SOC: ${Math.round(socPercent)} %`,
    `Výdrž: ${Math.round(hours * 10) / 10} h`,
    `Do západu: ${Number.isFinite(toSunsetH) ? Math.round(toSunsetH * 10) / 10 : "—"} h`,
    `Do západu odhad: ${Number.isFinite(untilSunsetWh) ? Math.round(untilSunsetWh * 10) / 10 : "—"} Wh`,
  ];

  // pro budoucí učení / debug
  rememberExperience(state, "brainTick", {
    socPercent: Math.round(socPercent),
    hours: Math.round(hours * 10) / 10,
    solarW,
    loadW,
    isDay,
    risk: Math.round(risk),
    sampling,
  });
}
