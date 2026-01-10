// brain.js (B 3.22)
// Mozek napojený na svět: používá východ/západ, irradiance, eventy a vnitřní teplotu boxu.
// Výstupy:
// - state.device.fan (řízení chlazení)
// - state.brain (diagnostika, risk score, predikce)
// - state.message + state.details (lidské, nekřičící hlášky)

import { rememberExperience } from "./memory.js";

function clamp(x, a, b) {
  return Math.max(a, Math.min(b, x));
}

function n(x, fallback = 0) {
  const v = Number(x);
  return Number.isFinite(v) ? v : fallback;
}

function getSocPercent(state) {
  const b = state?.device?.battery;

  // starší jednoduchý model: číslo 0..100
  if (typeof b === "number") return clamp(b, 0, 100);

  // novější: objekt {soc:0..1} nebo {soc:0..100}
  if (b && typeof b === "object") {
    if (b.soc !== undefined) {
      const soc = n(b.soc, 0);
      // tolerujeme 0..1 i 0..100
      return clamp(soc <= 1.2 ? soc * 100 : soc, 0, 100);
    }
    if (b.percent !== undefined) return clamp(n(b.percent, 0), 0, 100);
  }

  return 0;
}

function getEnv(state) {
  // preferujeme nový svět
  const wEnv = state?.world?.environment;
  const legacy = state?.environment;

  return {
    // teploty
    airTempC: wEnv?.airTempC ?? wEnv?.temperature ?? legacy?.temperature,
    boxTempC: wEnv?.boxTempC ?? wEnv?.temperature ?? legacy?.temperature,
    feltTempC: wEnv?.feltTempC ?? wEnv?.temperature ?? legacy?.temperature,

    // světlo / solár
    lightLux: wEnv?.light ?? legacy?.light,
    irradianceWm2: wEnv?.irradianceWm2,
    solarPotentialW: wEnv?.solarPotentialW,

    // počasí
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
    sun: wEnv?.sun
  };
}

function hoursBetween(nowTs, futureTs) {
  if (!nowTs || !futureTs) return null;
  const dt = (futureTs - nowTs) / 3600000;
  return dt;
}

function estimateBatteryHours(state, socPercent) {
  // 1) Pokud má zařízení power.loadW (už včetně step-up ztrát), použijeme to.
  const loadW =
    n(state?.device?.power?.loadW, 0) ||
    (state?.device?.fan ? 0.2 : 0.05) ||
    0.12;

  // 2) Kapacita baterie (Wh) – preferujeme reálný výpočet z device.js:
  // - device.battery.capacityWh (počítáno dle mAh * V * usableFactor nebo batteryWh)
  // - device.config.batteryWh
  // - (device.config.batteryMah * batteryNomV * batteryUsableFactor)
  // - fallback na identity.batteryWh (legacy)
  const capFromBattery = n(state?.device?.battery?.capacityWh, NaN);
  const capFromCfgWh = n(state?.device?.config?.batteryWh, NaN);

  const mah = n(state?.device?.config?.batteryMah, NaN);
  const nomV = n(state?.device?.config?.batteryNomV, 3.7);
  const usable = clamp(n(state?.device?.config?.batteryUsableFactor, 0.8), 0.3, 0.95);
  const capFromMah = Number.isFinite(mah) ? (mah / 1000) * nomV * usable : NaN;

  const id = state?.device?.identity || {};
  const capFromIdentity = n(id.batteryWh, NaN);

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

function estimateSolarUntilSunsetWh(state, env, nowTs) {
  // Jednoduchý, ale realistický odhad:
  // vezmeme aktuální solarPotentialW a vynásobíme "zbývajícím" faktorem do západu.
  // Pokud nemáme sun data, vrátíme null.

  const sunsetTs = env?.sun?.sunsetTs;
  if (!sunsetTs) return null;

  const hToSunset = hoursBetween(nowTs, sunsetTs);
  if (hToSunset === null) return null;
  if (hToSunset <= 0) return 0;

  const pNow = n(env.solarPotentialW, 0);
  if (pNow <= 0) return 0;

  // tvar křivky: teď * průměrný koeficient do konce dne.
  // Pokud je pozdě odpoledne, už toho moc nebude.
  // Použijeme konzervativní průměr: 0.55 (když jsi kolem poledne), klesá k 0.25.
  const k = clamp(0.25 + 0.30 * Math.min(1, hToSunset / 6), 0.25, 0.55);

  return pNow * hToSunset * k;
}

function setHumanMessage(state, msg, details = []) {
  state.message = msg;
  state.details = Array.isArray(details) ? details : [String(details)];
}

// ✅ DŮLEŽITÉ: simulator.js importuje "decide", takže export musí existovat
export function decide(state) {
  if (!state || !state.time) return;

  const nowTs = n(state.time.now, Date.now());
  const env = getEnv(state);
  const soc = getSocPercent(state);
  const batHours = estimateBatteryHours(state, soc);

  const hToSunset = env.sun?.sunsetTs ? hoursBetween(nowTs, env.sun.sunsetTs) : null;
  const hToSunrise = env.sun?.sunriseTs ? hoursBetween(nowTs, env.sun.sunriseTs) : null;

  // Pokud je sunrise v minulosti (během dne), dopočítáme "do zítřejšího"
  let hToSunriseNext = hToSunrise;
  if (hToSunriseNext !== null && hToSunriseNext < 0 && env.sun?.sunsetTs) {
    hToSunriseNext = hToSunriseNext + 24;
  }

  const solarLeftWh = estimateSolarUntilSunsetWh(state, env, nowTs);

  // --- risk score ---
  let risk = 0;

  // baterie
  if (soc < 20) risk += clamp((20 - soc) * 2.2, 0, 44);
  if (soc < 10) risk += 18;

  // teploty
  const boxT = n(env.boxTempC, n(env.airTempC, 0));
  if (boxT >= 45) risk += clamp((boxT - 45) * 3.0, 0, 40);
  if (boxT >= 55) risk += 25;
  if (boxT <= -10) risk += clamp((-10 - boxT) * 1.8, 0, 25);

  // eventy / počasí
  if (env.thunder || env.events?.storm) risk += 14;
  if (env.windMs !== undefined && n(env.windMs, 0) >= 12) risk += 10;
  if (env.events?.gust) risk += 6;
  if (env.events?.fog) risk += 4;
  if (env.snowing) risk += 4;
  if (env.raining && n(env.rainMmH, 0) >= 5) risk += 4;

  // tma + nízká baterie = vyšší riziko
  if (hToSunset !== null && hToSunset <= 1.0 && soc < 25) risk += 10;

  risk = clamp(Math.round(risk), 0, 100);

  // --- režim / plán ---
  let mode = "NORMAL";
  if (risk >= 70) mode = "SURVIVAL";
  else if (risk >= 45) mode = "CAUTION";
  else if (risk <= 15 && soc >= 45) mode = "LEARN";

  // --- akce: fan ---
  const criticalEnergy = soc < 8 || batHours < 4;
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

  // --- učení / zkušenosti ---
  if (severeOverheat) {
    rememberExperience(state, "box_overheat", { boxTempC: boxT, soc });
  }
  if (soc < 8) {
    rememberExperience(state, "energy_critical", { soc, batHours });
  }
  if (env.thunder) {
    rememberExperience(state, "storm_thunder", { windMs: n(env.windMs, 0), rainMmH: n(env.rainMmH, 0) });
  }
  if (env.snowing) {
    rememberExperience(state, "snowing", { snowDepthCm: n(env.snowDepthCm, 0), airTempC: n(env.airTempC, 0) });
  }

  // --- data sampling policy (hint) ---
  let sampling = "NORMAL";
  if (mode === "SURVIVAL") sampling = "LOW";
  else if (mode === "CAUTION") sampling = "NORMAL";
  else if (mode === "LEARN") sampling = "HIGH";

  state.device = state.device || {};
  state.device.fan = !!fan;

  // --- brain diagnostics ---
  state.brain = {
    version: "B 3.22",
    mode,
    risk,
    fan: !!fan,
    battery: {
      socPercent: Math.round(soc),
      hours: Math.round(batHours * 10) / 10
    },
    solar: {
      solarPotentialW: n(env.solarPotentialW, 0),
      irradianceWm2: n(env.irradianceWm2, 0),
      untilSunsetWh: solarLeftWh === null ? null : Math.round(solarLeftWh * 100) / 100
    },
    time: {
      hoursToSunset: hToSunset === null ? null : Math.round(hToSunset * 10) / 10,
      hoursToSunrise: hToSunriseNext === null ? null : Math.round(hToSunriseNext * 10) / 10
    },
    temps: {
      airTempC: Math.round(n(env.airTempC, 0) * 10) / 10,
      boxTempC: Math.round(boxT * 10) / 10,
      feltTempC: Math.round(n(env.feltTempC, n(env.airTempC, 0)) * 10) / 10
    },
    weather: {
      windMs: Math.round(n(env.windMs, 0) * 10) / 10,
      raining: !!env.raining,
      rainMmH: Math.round(n(env.rainMmH, 0) * 10) / 10,
      thunder: !!env.thunder,
      snowing: !!env.snowing,
      snowDepthCm: Math.round(n(env.snowDepthCm, 0) * 10) / 10,
      events: env.events || {}
    },
    sampling
  };

  // --- lidská hláška ---
  const details = [];
  details.push(`SOC: ${Math.round(soc)} %`);
  details.push(`Výdrž: ${Math.round(batHours * 10) / 10} h`);

  if (hToSunset !== null) details.push(`Do západu: ${Math.max(0, Math.round(hToSunset * 10) / 10)} h`);
  if (solarLeftWh !== null) details.push(`Do západu odhad: ~${Math.round(solarLeftWh * 10) / 10} Wh`);

  if (mode === "SURVIVAL") {
    setHumanMessage(
      state,
      "Jedu v úsporném režimu, ať bezpečně vydržím noc.",
      details
    );
  } else if (severeOverheat) {
    setHumanMessage(
      state,
      "Je mi trochu horko, chladím elektroniku a hlídám spotřebu.",
      [...details, `Box: ${Math.round(boxT * 10) / 10} °C`]
    );
  } else if (env.thunder || env.events?.storm) {
    setHumanMessage(
      state,
      "Venku to vypadá na bouřku. Držím se v klidu a sbírám data opatrně.",
      details
    );
  } else if (mode === "LEARN") {
    setHumanMessage(
      state,
      "Podmínky vypadají dobře. Můžu si dovolit sbírat víc dat a učit se.",
      details
    );
  } else {
    setHumanMessage(
      state,
      "Podmínky jsou v normě. Průběžně sleduju energii i počasí.",
      details
    );
  }
}
