// energy.js
// T 3.33.0 – Energie & Power-Path (UZAVŘENÁ TEORIE)
//
// Používá 2× INA219:
// - INA_IN  (příjem ze soláru)
// - INA_OUT (spotřeba systému / baterie)
//
// Požadavky:
// - vzorkování 1–5 s, reálné Δt (dtMs z ticku)
// - p_raw i p_ema (EMA ~10–30 s)
// - Wh integrace z p_raw s anti-šum logikou (dynamický deadband z IDLE; záporné P ignoruj)
// - wh_in_today / wh_out_today / wh_net_today (reset v lokální půlnoci)
// - rolling 24h (bucketový model)
// - power_state: CHARGING / DISCHARGING / IDLE / MIXED
// - power_path_state: SOLAR_TO_LOAD / SOLAR_TO_BATT / BATT_TO_LOAD / FLOAT / UNKNOWN
// - signal_quality pro oba toky
// - SoC: soc_est (0–1) hybrid (napěťová kotva jen při dlouhém IDLE + pomalá korekce dle Wh bilance)
//        soc_confidence (0–1) roste při stabilním IDLE a dobrém quality, klesá při nestabilitě a anomáliích
//
// DŮLEŽITÉ: Energie nic neřídí – jen publikuje interpretaci do state.energy.* pro mozek (T 3.29.0).

function clamp(v, a, b) {
  return Math.max(a, Math.min(b, v));
}

function num(x, fallback = NaN) {
  const n = Number(x);
  return Number.isFinite(n) ? n : fallback;
}

function expAlpha(dtSec, tauSec) {
  const tau = Math.max(0.001, tauSec);
  const dt = Math.max(0, dtSec);
  return 1 - Math.exp(-dt / tau);
}

function pragueParts(ts) {
  const dtf = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Prague",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    hour12: false,
  });
  const parts = dtf.formatToParts(new Date(ts));
  const get = (t) => parts.find((p) => p.type === t)?.value;
  return {
    y: get("year"),
    m: get("month"),
    d: get("day"),
    hh: get("hour"),
  };
}

function pragueDayKey(ts) {
  const p = pragueParts(ts);
  return `${p.y}-${p.m}-${p.d}`;
}

function pragueHourKey(ts) {
  const p = pragueParts(ts);
  return `${p.y}-${p.m}-${p.d}T${p.hh}`;
}

function voltageToSoc(v) {
  // Hrubá "kotva" pro Li-Ion 1S.
  // Používá se jen při dlouhém IDLE, proto stačí robustní, ne dokonalá křivka.
  const x = clamp((v - 3.0) / (4.2 - 3.0), 0, 1);
  // mírně "S" křivka, aby střed nebyl přecitlivělý
  const s = x * x * (3 - 2 * x);
  return clamp(0.02 + 0.96 * s, 0, 1);
}

function ensureEnergy(state) {
  if (!state.energy) state.energy = {};
  const e = state.energy;

  if (!e.config) {
    e.config = {
      emaTauSec: 20, // ~10–30 s
      minDeadbandW: 0.03,
      deadbandK: 3.0,
      idleQualMin: 0.75,
      idleAnchorSec: 90,
      socVoltageGainPerSec: 0.01,
      socConfidenceUpPerSec: 0.003,
      socConfidenceDownPerSec: 0.006,
      pathThresholdW: 0.12,
      pathMarginW: 0.20,
      buckets: {
        hours: 24,
      },
    };
  }

  if (!e.ina_in) {
    e.ina_in = {
      p_raw: 0,
      p_ema: 0,
      v_raw: 0,
      i_raw: 0,
      signal_quality: 0,
      idleNoiseEmaW: 0,
    };
  }
  if (!e.ina_out) {
    e.ina_out = {
      p_raw: 0,
      p_ema: 0,
      v_raw: 0,
      i_raw: 0,
      signal_quality: 0,
      idleNoiseEmaW: 0,
    };
  }

  if (!e.totals) {
    e.totals = {
      dayKey: null,
      wh_in_today: 0,
      wh_out_today: 0,
      wh_net_today: 0,
    };
  }

  if (!e.rolling24h) {
    e.rolling24h = {
      // 24h bucketový model (hour-buckets)
      lastHourKey: null,
      buckets: [], // { hourKey, wh_in, wh_out }
      wh_in_24h: 0,
      wh_out_24h: 0,
      wh_net_24h: 0,
    };
  }

  if (!e.states) {
    e.states = {
      power_state: "UNKNOWN",
      power_path_state: "UNKNOWN",
      idleSeconds: 0,
    };
  }

  if (!e.soc) {
    const initialSoc = num(state.device?.battery?.soc, NaN);
    e.soc = {
      soc_est: Number.isFinite(initialSoc) ? clamp(initialSoc, 0, 1) : 0.6,
      soc_confidence: 0.35,
      lastAnchorTs: 0,
    };
  }
}

function getInaReadings(state) {
  // Preferuje state.device.sensors.ina219 (simulace/hw), fallback na starší device.power.
  const ina = state?.device?.sensors?.ina219;
  const inObj = ina?.ina_in || ina?.solarIn; // kompatibilita názvů
  const outObj = ina?.ina_out || ina?.loadOut;

  const solarP = num(inObj?.powerW, num(state?.device?.power?.solarInW, num(state?.device?.solarInW, 0)));
  const solarV = num(inObj?.voltageV, 0);
  const solarI = num(inObj?.currentA, 0);

  const loadP = num(outObj?.powerW, num(state?.device?.power?.loadW, num(state?.device?.loadW, 0)));
  const loadV = num(outObj?.voltageV, num(state?.device?.battery?.voltage, 0));
  const loadI = num(outObj?.currentA, 0);

  return {
    ina_in: { p: Math.max(0, solarP), v: solarV, i: solarI },
    ina_out: { p: Math.max(0, loadP), v: loadV, i: loadI },
  };
}

function updateSignalQuality(flow, dtSec, expectedMaxW = null) {
  // Heuristika kvality signálu:
  // - chybějící data => 0
  // - velký rozdíl p_raw vs p_ema => nestabilita
  // - extrémní šum v IDLE => dolů
  // - překročení očekávané max => anomálie
  const p = num(flow.p_raw, NaN);
  const ema = num(flow.p_ema, NaN);
  if (!Number.isFinite(p) || !Number.isFinite(ema)) return 0;

  const diff = Math.abs(p - ema);
  const scale = 0.25 + 0.75 * Math.max(0.1, Math.abs(ema));
  let q = Math.exp(-diff / scale);

  const noise = num(flow.idleNoiseEmaW, 0);
  if (noise > 0.12) q *= 0.7;
  if (noise > 0.25) q *= 0.45;

  if (expectedMaxW !== null && Number.isFinite(expectedMaxW)) {
    if (p > expectedMaxW * 1.25) q *= 0.4;
    if (p > expectedMaxW * 1.6) q *= 0.15;
  }

  // pomalé vyhlazení kvality
  const a = expAlpha(dtSec, 10);
  const prev = num(flow.signal_quality, 0);
  return clamp(prev + (q - prev) * a, 0, 1);
}

function computeDeadbandW(flowIn, flowOut, cfg) {
  // Dynamický deadband: v IDLE se učí typický šum (idleNoiseEmaW),
  // deadband = max(minDeadband, K * noise).
  const nIn = num(flowIn.idleNoiseEmaW, 0);
  const nOut = num(flowOut.idleNoiseEmaW, 0);
  const noise = Math.max(nIn, nOut);
  return Math.max(cfg.minDeadbandW, cfg.deadbandK * noise);
}

function classifyStates(pInEma, pOutEma, deadbandW, cfg) {
  const inOn = pInEma > deadbandW;
  const outOn = pOutEma > deadbandW;

  let power_state = "UNKNOWN";
  if (!inOn && !outOn) power_state = "IDLE";
  else if (inOn && !outOn) power_state = "CHARGING";
  else if (!inOn && outOn) power_state = "DISCHARGING";
  else power_state = "MIXED";

  // Power-path: heuristika podle vztahu IN vs OUT.
  const th = cfg.pathThresholdW;
  const margin = cfg.pathMarginW;

  let power_path_state = "UNKNOWN";
  const inOk = pInEma > th;
  const outOk = pOutEma > th;

  if (inOk && !outOk) {
    power_path_state = "FLOAT"; // slunce je, zátěž téměř žádná
  } else if (!inOk && outOk) {
    power_path_state = "BATT_TO_LOAD";
  } else if (inOk && outOk) {
    if (pInEma >= pOutEma + margin) power_path_state = "SOLAR_TO_BATT"; // velký přebytek
    else if (pInEma >= pOutEma - margin) power_path_state = "SOLAR_TO_LOAD"; // pokryje load +/- malé
    else power_path_state = "BATT_TO_LOAD"; // load převyšuje solar
  }

  return { power_state, power_path_state };
}

function addToRolling(rolling, hourKey, dInWh, dOutWh, hours) {
  // hour-bucket model: max 24 bucketů.
  if (rolling.lastHourKey !== hourKey) {
    rolling.lastHourKey = hourKey;
    rolling.buckets.push({ hourKey, wh_in: 0, wh_out: 0 });
    if (rolling.buckets.length > hours) rolling.buckets.splice(0, rolling.buckets.length - hours);
  }

  const b = rolling.buckets[rolling.buckets.length - 1];
  b.wh_in += dInWh;
  b.wh_out += dOutWh;

  // recompute sums (O(24) je úplně v pohodě)
  let sIn = 0;
  let sOut = 0;
  for (const x of rolling.buckets) {
    sIn += x.wh_in;
    sOut += x.wh_out;
  }
  rolling.wh_in_24h = sIn;
  rolling.wh_out_24h = sOut;
  rolling.wh_net_24h = sIn - sOut;
}

function updateSoC(state, dtSec, deadbandW) {
  const e = state.energy;
  const cfg = e.config;

  const capWh = num(state.device?.battery?.capacityWh, num(state.device?.identity?.batteryWh, NaN));
  const capacityWh = Number.isFinite(capWh) ? Math.max(0.1, capWh) : 9.9; // fallback pro 3350mAh@80%
  const vBat = num(state.device?.battery?.voltage, NaN);

  const soc = e.soc;

  // 1) coulomb/Wh bilance (přesnější integrace dělá integrátor níž; zde jen re-map do SOC)
  // wh_net_today je kumulativní od půlnoci; pro SOC potřebujeme okamžité delta – uložíme si poslední.
  if (soc._lastWhNetToday === undefined) soc._lastWhNetToday = num(e.totals.wh_net_today, 0);
  const whNetNow = num(e.totals.wh_net_today, 0);
  const dWh = whNetNow - soc._lastWhNetToday;
  soc._lastWhNetToday = whNetNow;

  // SOC roste když dWh > 0 (nabíjení), klesá když dWh < 0 (vybíjení)
  const dSoc = dWh / capacityWh;
  soc.soc_est = clamp(num(soc.soc_est, 0.6) + dSoc, 0, 1);

  // 2) napěťová kotva pouze při dlouhém IDLE a dobré kvalitě
  const idleSec = num(e.states.idleSeconds, 0);
  const qIn = num(e.ina_in.signal_quality, 0);
  const qOut = num(e.ina_out.signal_quality, 0);
  const qMin = Math.min(qIn, qOut);

  const longIdle = idleSec >= cfg.idleAnchorSec;
  const stable = qMin >= cfg.idleQualMin;

  if (longIdle && stable && Number.isFinite(vBat)) {
    const target = voltageToSoc(vBat);

    // pomalá korekce (kotva) – jen malý gain, aby to nebylo nervózní
    const g = cfg.socVoltageGainPerSec * dtSec * clamp(soc.soc_confidence, 0.1, 1);
    soc.soc_est = clamp(soc.soc_est + (target - soc.soc_est) * clamp(g, 0, 0.25), 0, 1);

    soc.lastAnchorTs = num(state.time?.now, Date.now());
  }

  // 3) confidence (vzrůst / pokles)
  const unstable = qMin < 0.45 || Math.abs(num(e.ina_in.p_raw, 0) - num(e.ina_in.p_ema, 0)) > 0.8;
  const anomalous = num(e.ina_in.signal_quality, 0) < 0.2 || num(e.ina_out.signal_quality, 0) < 0.2;

  let conf = num(soc.soc_confidence, 0.35);

  if (longIdle && stable && !unstable) conf += cfg.socConfidenceUpPerSec * dtSec;
  if (unstable || anomalous) conf -= cfg.socConfidenceDownPerSec * dtSec;

  // lehce trestáme MIXED (nejistý power-path)
  if (e.states.power_state === "MIXED") conf -= 0.0015 * dtSec;

  soc.soc_confidence = clamp(conf, 0, 1);
}

function resetAtMidnightIfNeeded(state, nowTs) {
  const e = state.energy;
  const dayKey = pragueDayKey(nowTs);
  if (e.totals.dayKey !== dayKey) {
    e.totals.dayKey = dayKey;
    e.totals.wh_in_today = 0;
    e.totals.wh_out_today = 0;
    e.totals.wh_net_today = 0;

    // pro SOC delta tracking
    if (e.soc) e.soc._lastWhNetToday = 0;
  }
}

function antiNoiseIntegrateWh(powerW, dtSec, deadbandW) {
  // Integrace z p_raw:
  // - záporné P ignorujeme
  // - |P| < deadband => 0
  if (!Number.isFinite(powerW) || powerW <= 0) return 0;
  if (powerW < deadbandW) return 0;
  return (powerW * dtSec) / 3600;
}

function updateIdleNoise(flow, pRaw, dtSec, isIdleCandidate) {
  // "IDLE šum" se učí jen v IDLE kandidátu – aby se noise nekrmil reálnými toky.
  // Použijeme EMA na |p|.
  const tau = 20; // relativně rychlé, aby deadband reagoval
  const a = expAlpha(dtSec, tau);

  const prev = num(flow.idleNoiseEmaW, 0);
  const sample = Math.abs(num(pRaw, 0));

  const next = isIdleCandidate ? (prev + (sample - prev) * a) : prev;
  flow.idleNoiseEmaW = clamp(next, 0, 5);
}

export function energyTick(state, dtMs = 1000) {
  ensureEnergy(state);

  const nowTs = num(state.time?.now, Date.now());
  const dtSec = Math.max(0, num(dtMs, 1000)) / 1000;

  // --- reset v lokální půlnoci ---
  resetAtMidnightIfNeeded(state, nowTs);

  const e = state.energy;
  const cfg = e.config;

  // --- čtení INA ---
  const r = getInaReadings(state);
  const pInRaw = Math.max(0, num(r.ina_in.p, 0));  // záporné ignoruj
  const pOutRaw = Math.max(0, num(r.ina_out.p, 0)); // záporné ignoruj

  // --- p_raw ---
  e.ina_in.p_raw = pInRaw;
  e.ina_out.p_raw = pOutRaw;
  e.ina_in.v_raw = num(r.ina_in.v, 0);
  e.ina_in.i_raw = num(r.ina_in.i, 0);
  e.ina_out.v_raw = num(r.ina_out.v, 0);
  e.ina_out.i_raw = num(r.ina_out.i, 0);

  // --- p_ema ---
  const a = expAlpha(dtSec, cfg.emaTauSec);
  e.ina_in.p_ema = num(e.ina_in.p_ema, 0) + (pInRaw - num(e.ina_in.p_ema, 0)) * a;
  e.ina_out.p_ema = num(e.ina_out.p_ema, 0) + (pOutRaw - num(e.ina_out.p_ema, 0)) * a;

  // --- IDLE kandidát (pro učení deadbandu) ---
  // Předběžně IDLE, když oba EMA malé.
  const idleCandidate = e.ina_in.p_ema < 0.08 && e.ina_out.p_ema < 0.08;
  updateIdleNoise(e.ina_in, pInRaw, dtSec, idleCandidate);
  updateIdleNoise(e.ina_out, pOutRaw, dtSec, idleCandidate);

  // --- deadband ---
  const deadbandW = computeDeadbandW(e.ina_in, e.ina_out, cfg);

  // --- klasifikace stavů ---
  const st = classifyStates(e.ina_in.p_ema, e.ina_out.p_ema, deadbandW, cfg);
  e.states.power_state = st.power_state;
  e.states.power_path_state = st.power_path_state;

  // idle seconds tracking
  if (e.states.power_state === "IDLE") e.states.idleSeconds = num(e.states.idleSeconds, 0) + dtSec;
  else e.states.idleSeconds = 0;

  // --- signal_quality ---
  const panelMaxW = num(state.device?.identity?.panelMaxW, NaN);
  e.ina_in.signal_quality = updateSignalQuality(e.ina_in, dtSec, Number.isFinite(panelMaxW) ? panelMaxW : null);
  e.ina_out.signal_quality = updateSignalQuality(e.ina_out, dtSec, null);

  // --- integrace Wh (anti-noise, z p_raw) ---
  const dInWh = antiNoiseIntegrateWh(pInRaw, dtSec, deadbandW);
  const dOutWh = antiNoiseIntegrateWh(pOutRaw, dtSec, deadbandW);

  e.totals.wh_in_today = num(e.totals.wh_in_today, 0) + dInWh;
  e.totals.wh_out_today = num(e.totals.wh_out_today, 0) + dOutWh;
  e.totals.wh_net_today = num(e.totals.wh_in_today, 0) - num(e.totals.wh_out_today, 0);

  // --- rolling 24h (hour buckets) ---
  const hKey = pragueHourKey(nowTs);
  addToRolling(e.rolling24h, hKey, dInWh, dOutWh, num(cfg.buckets.hours, 24));

  // --- SoC hybrid (interpretace) ---
  updateSoC(state, dtSec, deadbandW);

  // --- convenience mirror pro mozek / UI ---
  // (mozku nevnucujeme nic; jen dáváme k dispozici)
  e.deadbandW = deadbandW;

  e.summary = {
    p_in_raw: e.ina_in.p_raw,
    p_in_ema: e.ina_in.p_ema,
    p_out_raw: e.ina_out.p_raw,
    p_out_ema: e.ina_out.p_ema,
    wh_in_today: e.totals.wh_in_today,
    wh_out_today: e.totals.wh_out_today,
    wh_net_today: e.totals.wh_net_today,
    wh_in_24h: e.rolling24h.wh_in_24h,
    wh_out_24h: e.rolling24h.wh_out_24h,
    wh_net_24h: e.rolling24h.wh_net_24h,
    power_state: e.states.power_state,
    power_path_state: e.states.power_path_state,
    soc_est: e.soc.soc_est,
    soc_confidence: e.soc.soc_confidence,
    q_in: e.ina_in.signal_quality,
    q_out: e.ina_out.signal_quality,
  };
}
