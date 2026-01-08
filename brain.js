// brain.js (B 3.10)
// - Trend, rizika, stavové rozhodování, učení z historie
import { rememberExperience } from "./memory.js";

const TZ = "Europe/Prague";

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
function msToNextSunrise(ts, sunriseHour = 6, sunriseMinute = 0) {
  const p = getPragueParts(ts);

  // vytvoříme "dnešní" sunrise v lokálním čase Prahy (přes Date v UTC epoch -> použijeme offset přes Intl není jednoduché)
  // Uděláme pragmaticky: spočítáme minuty dne a porovnáme.
  const nowMin = p.hour * 60 + p.minute + p.second / 60;
  const sunriseMin = sunriseHour * 60 + sunriseMinute;

  let deltaMin;
  if (nowMin <= sunriseMin) deltaMin = sunriseMin - nowMin;
  else deltaMin = (24 * 60 - nowMin) + sunriseMin;

  return Math.round(deltaMin * 60 * 1000);
}

/** Získej SOC v % co nejrobustněji */
function getSocPct(state) {
  const socPct =
    safeGet(state, "device.socPct", null) ??
    (safeGet(state, "device.battery.soc", null) !== null ? safeGet(state, "device.battery.soc", 0) * 100 : null) ??
    safeGet(state, "device.batteryPct", null) ??
    safeGet(state, "device.battery", null); // fallback na staré "battery"

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

/** Odhad výdrže v hodinách při záporném netW */
function estimateHoursLeft(state, socPct, netW, loadW) {
  // Preferuj balanceWh (pokud existuje) – to je nejlepší.
  const balWh =
    safeGet(state, "device.power.balanceWh", null) ??
    safeGet(state, "device.battery.balanceWh", null) ??
    null;

  if (balWh !== null && balWh !== undefined) {
    const w = Math.max(0.001, Math.abs(netW || loadW || 0.001));
    return Number(balWh) / w;
  }

  // fallback: odhad kapacity baterie ve Wh (konfigurovatelný)
  // default 18650 1s ~ 3.7V * 3Ah = 11.1Wh (příklad); ty můžeš později přenastavit v state.device.batteryCapacityWh
  const capWh = Number(safeGet(state, "device.batteryCapacityWh", 11.1));
  if (!socPct && socPct !== 0) return null;
  const availWh = (capWh * socPct) / 100;

  const w = Math.max(0.001, Math.abs(netW || loadW || 0.001));
  return availWh / w;
}

/** Runtime historie pro trend (ne do days, jen běhově) */
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
      version: "B3.10",
      // 1.0 = neutrální, >1 konzervativnější (rychleji šetří), <1 agresivnější
      conservativeness: 1.0,
      // minimální noční rezerva SOC (%), kterou chce držet
      nightReservePct: 25,
      // jak agresivně sbírat data (0..1), vyšší = víc dat
      samplingAggressiveness: 0.55,
      // poslední známé "bad events"
      counters: {
        riskEvents: 0,
        criticalEvents: 0,
        deepDischargeEvents: 0,
        overheatEvents: 0
      }
    };
  }
  return state.memory.brainModel;
}

/** Aktualizace runtime sample listu */
function pushSample(runtime, t, socPct, netW) {
  runtime.samples.push({ t, socPct, netW });

  // drž posledních ~6 hodin (při 1s to je moc; ale budeme řezat časově)
  const KEEP_MS = 6 * 60 * 60 * 1000;
  const minT = t - KEEP_MS;
  runtime.samples = runtime.samples.filter(s => s.t >= minT);

  // hard cap
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
function classifyEnergyState({ netW, socPct, hoursLeft }, isDay, model) {
  // prahy ovlivněné konzervativností
  const cons = clamp(model.conservativeness, 0.7, 1.6);

  const reserve = clamp(model.nightReservePct, 10, 50);
  const criticalSoc = 10 * cons;          // kolem 10–16 %
  const riskSoc = Math.max(reserve, 18 * cons); // držím aspoň rezervu
  const safeSoc = 40;                     // "ok" noční SOC

  // pokud net >= 0, je to energeticky stabilní (zisk nebo rovnováha)
  if (netW >= 0.02) return "POSITIVE";
  if (netW > -0.02 && netW < 0.02) return "BALANCED";

  // netW < 0 => vybíjím
  if (socPct !== null && socPct <= criticalSoc) return "CRITICAL";

  // když je výdrž krátká, riziko
  if (hoursLeft !== null && hoursLeft !== undefined) {
    // v noci je riziko přísnější – nechci umřít před ránem
    const strictHours = isDay ? 6 * cons : 10 * cons;
    if (hoursLeft <= strictHours) return "DRAINING_RISK";
  }

  // když SOC padá pod rezervu, riziko
  if (socPct !== null && socPct <= riskSoc) return "DRAINING_RISK";

  // jinak kontrolované vybíjení
  return "DRAINING_SAFE";
}

/** Režim sběru dat podle stavu */
function decideSampling(energyState, isDay, model) {
  const a = clamp(model.samplingAggressiveness, 0, 1);

  // Základní logika:
  // - POSITIVE: HIGH (sbírej víc, máš energii)
  // - BALANCED: NORMAL
  // - DRAINING_SAFE: LOW (noc / vybíjení)
  // - DRAINING_RISK: ULTRA_LOW
  // - CRITICAL: HIBERNATE
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

  // penalizuj riziko a kritiku
  if (energyState === "DRAINING_RISK") c.riskEvents += 1;
  if (energyState === "CRITICAL") c.criticalEvents += 1;

  // pokud SOC rychle klesá, buď konzervativnější
  if (socTrendPH !== null && socTrendPH < -5) {
    model.conservativeness = clamp(model.conservativeness + 0.01, 0.7, 1.6);
    model.nightReservePct = clamp(model.nightReservePct + 0.2, 10, 50);
    model.samplingAggressiveness = clamp(model.samplingAggressiveness - 0.01, 0, 1);
  }

  // pokud je dlouho pozitivní net, může být odvážnější (pomalu)
  if (netW > 0.2 && isDay) {
    model.conservativeness = clamp(model.conservativeness - 0.002, 0.7, 1.6);
    model.samplingAggressiveness = clamp(model.samplingAggressiveness + 0.002, 0, 1);
  }

  // pokud moc často riskuješ, přitvrď
  if (c.riskEvents > 60) { // přibližně 1 minuta při 1s ticku
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

/** Texty do UI */
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

  // "API" pro device (pokud si to čte, super; pokud ne, nic se nerozbije)
  state.device.samplingMode = samplingMode;         // HIGH / NORMAL / LOW / ULTRA_LOW / HIBERNATE
  state.device.savingMode = ["DRAINING_RISK", "CRITICAL"].includes(energyState);

  // doporučený interval sběru (sekundy)
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

  // příliš nízká energie => fan OFF
  if (energyState === "CRITICAL") return { fan: false, reason: "kritická energie" };

  // základní hystereze
  const onT = 30;
  const offT = 27;

  const current = !!safeGet(state, "device.fan", false);

  // v riziku fan jen při opravdu vysoké teplotě
  if (energyState === "DRAINING_RISK") {
    if (t >= 33 && (socPct === null || socPct > 15)) return { fan: true, reason: "vysoká teplota i přes riziko" };
    return { fan: false, reason: "šetřím energii (riziko)" };
  }

  if (!current && t >= onT) return { fan: true, reason: "teplota vysoká" };
  if (current && t <= offT) return { fan: false, reason: "teplota v normě" };

  return { fan: current, reason: current ? "držím ochlazování" : "není potřeba" };
}

export function decide(state) {
  // struktury pro UI
  if (!state.details) state.details = [];
  state.details = [];

  const tNow = nowMs(state);
  const model = ensureBrainModel(state);
  const runtime = ensureBrainRuntime(state);

  const isDay = !!safeGet(state, "time.isDay", safeGet(state, "world.time.isDay", true));
  const socPct = getSocPct(state);
  const { solarW, loadW, netW } = getPower(state);

  // runtime trend sample
  pushSample(runtime, tNow, socPct, netW);

  // trend SOC (30 min okno)
  const socTrendPH = socTrendPctPerHour(runtime, 30);

  // výdrž
  const hoursLeft = (netW < 0) ? estimateHoursLeft(state, socPct, netW, loadW) : null;

  // nocní riziko: do svítání
  const toSunriseMs = msToNextSunrise(tNow, 6, 0);
  const toSunriseH = toSunriseMs / (1000 * 60 * 60);

  // vyhodnocení stavu
  const energyState = classifyEnergyState({ netW, socPct, hoursLeft }, isDay, model);

  // učení
  learn(model, energyState, socTrendPH, isDay, netW);

  // sampling
  const samplingMode = decideSampling(energyState, isDay, model);
  setDeviceDirectives(state, samplingMode, energyState);

  // větrák
  const fanDecision = decideFan(state, energyState, socPct);
  if (!state.device) state.device = {};
  state.device.fan = fanDecision.fan;

  // message + details do UI
  state.message = makeMessage(energyState, isDay, netW);

  // “pravdivé vysvětlení” (tohle je přesně ten rozdíl oproti „rok 2000 textu“)
  state.details.push(`SOC: ${socPct === null ? "—" : fmt(socPct, 0) + " %"} (trend ${socTrendPH === null ? "—" : fmt(socTrendPH, 2) + " %/h"})`);
  state.details.push(`Světlo: ${fmt(safeGet(state, "world.environment.light", safeGet(state, "environment.light", 0)), 0)} lx`);
  state.details.push(`Solár: ${fmt(solarW, 3)} W`);
  state.details.push(`Zátěž: ${fmt(loadW, 3)} W`);
  state.details.push(`Net: ${fmt(netW, 2)} W`);
  state.details.push(`Režim sběru: ${samplingMode} (interval ~${state.device.collectionIntervalSec}s)`);
  state.details.push(`Větrák: ${state.device.fan ? "ZAP" : "VYP"} (${fanDecision.reason})`);

  if (hoursLeft !== null && hoursLeft !== undefined) {
    state.details.push(`Výdrž ~ ${fmt(hoursLeft, 2)} h (bez zisku)`);
  }

  if (!isDay) {
    state.details.push(`Do svítání ~ ${fmt(toSunriseH, 2)} h`);
    state.details.push(`Noční rezerva cílově ≥ ${fmt(model.nightReservePct, 0)} % (konzervativnost x${fmt(model.conservativeness, 2)})`);
  } else {
    state.details.push(`Konzervativnost x${fmt(model.conservativeness, 2)} • agresivita sběru ${fmt(model.samplingAggressiveness, 2)}`);
  }

  // zkušenosti – loguj jen při změně stavu (ne spam každou vteřinu)
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

  // loguj rizika / kritiku jako samostatnou zkušenost (pro další učení v budoucnu)
  if (energyState === "DRAINING_RISK") {
    rememberExperience(state, "energy_risk", {
      socPct,
      netW,
      hoursLeft,
      toSunriseH
    });
  }
  if (energyState === "CRITICAL") {
    rememberExperience(state, "energy_critical", {
      socPct,
      netW,
      hoursLeft
    });
  }

  // Predikce pro UI (pokud ji UI umí zobrazit)
  if (!state.prediction) state.prediction = {};
  state.prediction.netW = netW;

  // expectedSolarWh – jednoduchý odhad: pokud je den, z posledních vzorků (fallback 0)
  // (reálnější model uděláme v další verzi, tady držím bezpečné minimum)
  state.prediction.expectedSolarWh = Math.max(0, safeGet(state, "prediction.expectedSolarWh", 0));

  // hoursLeft: pokud netW >= 0 -> null (UI pak ukáže ∞)
  state.prediction.hoursLeft = (netW >= 0) ? null : (hoursLeft !== null ? hoursLeft : null);
}
