// luxSunset.js
// B 3.34.0 – zpřesnění času do západu učením z lux (BH1750), minimalisticky
//
// Implementuje:
// - luxEma: EMA z BH1750 (τ cca 60–120 s)
// - dayFlag: den/noc z luxEma přes adaptivní práh (base/peak) + hysteréze + potvrzení 5–10 min
// - dayEndMinuteEma: učení konce dne z přechodu DAY→NIGHT (EMA)
// - hoursToSunsetEst: max(0,(dayEndMinuteEma-nowMinute)/60), v noci 0
//
// Pozn.: luxNightBase a luxDayPeak jsou interní pomocné proměnné pro adaptivní práh.
// Výstup navíc: nastavuje state.world.environment.sun.sunsetTs na odhad z lux,
// aby ho mozek (T 3.29.0) automaticky použil bez úprav.

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
    minute: "2-digit",
    hour12: false,
  });
  const parts = dtf.formatToParts(new Date(ts));
  const get = (t) => parts.find((p) => p.type === t)?.value;
  return {
    y: Number(get("year")),
    m: Number(get("month")),
    d: Number(get("day")),
    hh: Number(get("hour")),
    mm: Number(get("minute")),
  };
}

// Získání offsetu Europe/Prague vůči UTC v daném čase (ms)
function tzOffsetMs(ts, tz = "Europe/Prague") {
  // Node umí timeZoneName: 'shortOffset' (např. GMT+1 / GMT+2)
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    timeZoneName: "shortOffset",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  const parts = dtf.formatToParts(new Date(ts));
  const z = parts.find((p) => p.type === "timeZoneName")?.value || "GMT+0";
  const m = z.match(/GMT([+-])(\d{1,2})(?::(\d{2}))?/);
  if (!m) return 0;
  const sign = m[1] === "-" ? -1 : 1;
  const hh = Number(m[2] || 0);
  const mm = Number(m[3] || 0);
  return sign * (hh * 60 + mm) * 60000;
}

function pragueMidnightTs(ts) {
  const p = pragueParts(ts);
  const utcMidnight = Date.UTC(p.y, p.m - 1, p.d, 0, 0, 0, 0);
  const off = tzOffsetMs(utcMidnight, "Europe/Prague");
  // Prague midnight in UTC time:
  return utcMidnight - off;
}

function minuteOfDayPrague(ts) {
  const p = pragueParts(ts);
  return clamp(p.hh * 60 + p.mm, 0, 1439);
}

function ensureLux(state) {
  if (!state.luxSunset) {
    state.luxSunset = {
      luxEma: 0,
      dayFlag: false,
      dayEndMinuteEma: 18 * 60, // start guess 18:00
      hoursToSunsetEst: 0,
      // internals
      luxNightBase: 1,     // "tma"
      luxDayPeak: 300,     // typický "denní peak"
      _confirmDaySec: 0,
      _confirmNightSec: 0,
      _lastDayFlag: false,
      config: {
        luxTauSec: 90,           // 60–120 s
        confirmMin: 7,           // 5–10 minut
        baseLearnTauSec: 1800,   // 30 min (pomalé)
        peakLearnTauSec: 1200,   // 20 min (pomalé)
        peakDecayPerHour: 0.06,  // pomalý rozpad peak
        dayEndEmaAlpha: 0.20,    // EMA update při přechodu DAY→NIGHT
      },
    };
  }
}

function computeThresholds(base, peak) {
  const b = Math.max(0, base);
  const p = Math.max(b + 1e-6, peak);
  const thr = b + 0.12 * (p - b);
  const thrLow = b + 0.08 * (p - b);
  return { thr, thrLow };
}

function updateBasePeak(lx, dayFlag, dtSec, st) {
  // base: učíme v noci (když dayFlag == false), pomalu a robustně
  // peak: učíme ve dne, pomalu; zároveň lehký decay, aby se adaptoval na sezónu/šero
  const cfg = st.config;

  const aBase = expAlpha(dtSec, cfg.baseLearnTauSec);
  const aPeak = expAlpha(dtSec, cfg.peakLearnTauSec);

  if (!dayFlag) {
    // base směřuje k "nižší" hodnotě, ale EMA to uhladí
    const target = Math.max(0, lx);
    st.luxNightBase = st.luxNightBase + (target - st.luxNightBase) * aBase;
    st.luxNightBase = clamp(st.luxNightBase, 0, 50);
  } else {
    // peak se učí z denních hodnot
    const target = Math.max(st.luxDayPeak, lx);
    st.luxDayPeak = st.luxDayPeak + (target - st.luxDayPeak) * aPeak;
  }

  // decay peak (aby neustrnul)
  const decay = Math.max(0, 1 - (cfg.peakDecayPerHour * dtSec) / 3600);
  st.luxDayPeak = st.luxDayPeak * decay;

  // sanity
  st.luxDayPeak = clamp(st.luxDayPeak, st.luxNightBase + 1, 200000);
}

function applyHysteresis(luxEma, dtSec, st) {
  const { thr, thrLow } = computeThresholds(st.luxNightBase, st.luxDayPeak);
  const confirmSec = clamp(st.config.confirmMin, 5, 10) * 60;

  // když jsme v noci, chceme potvrdit "den" až po confirmSec nad thr
  // když jsme ve dne, chceme potvrdit "noc" až po confirmSec pod thrLow
  if (!st.dayFlag) {
    if (luxEma >= thr) st._confirmDaySec += dtSec;
    else st._confirmDaySec = 0;

    if (st._confirmDaySec >= confirmSec) {
      st.dayFlag = true;
      st._confirmDaySec = 0;
      st._confirmNightSec = 0;
    }
  } else {
    if (luxEma <= thrLow) st._confirmNightSec += dtSec;
    else st._confirmNightSec = 0;

    if (st._confirmNightSec >= confirmSec) {
      st.dayFlag = false;
      st._confirmNightSec = 0;
      st._confirmDaySec = 0;
    }
  }

  return { thr, thrLow };
}

function updateDayEndMinuteOnTransition(nowTs, st) {
  // učíme jen při přechodu DAY→NIGHT
  const last = !!st._lastDayFlag;
  const now = !!st.dayFlag;

  if (last === true && now === false) {
    const nowMin = minuteOfDayPrague(nowTs);
    const a = clamp(st.config.dayEndEmaAlpha, 0.05, 0.4);
    st.dayEndMinuteEma = st.dayEndMinuteEma + (nowMin - st.dayEndMinuteEma) * a;
    st.dayEndMinuteEma = clamp(st.dayEndMinuteEma, 0, 1439);
  }

  st._lastDayFlag = now;
}

function setSunsetTsFromLearned(state, nowTs, dayEndMinuteEma) {
  // přepíše sunsetTs v env.sun na "odhad z lux"
  // (mozek to automaticky použije)
  const midnight = pragueMidnightTs(nowTs);
  const endMin = clamp(dayEndMinuteEma, 0, 1439);
  const est = midnight + endMin * 60 * 1000;

  state.world = state.world || {};
  state.world.environment = state.world.environment || {};
  state.world.environment.sun = state.world.environment.sun || {};

  // uchovej originál (pokud existuje)
  if (state.world.environment.sun.sunsetTsWorld === undefined && state.world.environment.sun.sunsetTs !== undefined) {
    state.world.environment.sun.sunsetTsWorld = state.world.environment.sun.sunsetTs;
  }
  state.world.environment.sun.sunsetTs = est;

  // pro UI/debug
  state.world.environment.sun.sunsetTsLuxEst = est;
}

export function luxSunsetTick(state, dtMs = 1000) {
  ensureLux(state);
  const st = state.luxSunset;

  const nowTs = num(state?.time?.now, Date.now());
  const dtSec = Math.max(0, num(dtMs, 1000)) / 1000;

  // BH1750 lux: bereme z world.environment.light (svět), což simuluje senzor
  const luxRaw = num(state?.world?.environment?.light, NaN);
  if (!Number.isFinite(luxRaw)) return;

  // luxEma
  const a = expAlpha(dtSec, clamp(st.config.luxTauSec, 60, 120));
  st.luxEma = num(st.luxEma, luxRaw) + (luxRaw - num(st.luxEma, luxRaw)) * a;
  st.luxEma = Math.max(0, st.luxEma);

  // update base/peak
  updateBasePeak(st.luxEma, st.dayFlag, dtSec, st);

  // hysteréze + potvrzení
  const th = applyHysteresis(st.luxEma, dtSec, st);

  // učení konce dne
  updateDayEndMinuteOnTransition(nowTs, st);

  // hoursToSunsetEst
  const nowMin = minuteOfDayPrague(nowTs);
  if (st.dayFlag) {
    st.hoursToSunsetEst = Math.max(0, (st.dayEndMinuteEma - nowMin) / 60);
  } else {
    st.hoursToSunsetEst = 0;
  }

  // přepiš sunsetTs v environment.sun (aby to použil mozek)
  // jen když máme rozumný peak-base rozsah (aby se to nechovalo divně po startu)
  const span = Math.max(1, st.luxDayPeak - st.luxNightBase);
  const stableEnough = span >= 30; // lux jednotky v simulaci (0..1000), tohle stačí

  if (stableEnough) {
    setSunsetTsFromLearned(state, nowTs, st.dayEndMinuteEma);
  }

  // pro UI debug
  st.threshold = {
    thr: th.thr,
    thrLow: th.thrLow,
    base: st.luxNightBase,
    peak: st.luxDayPeak
  };
}
