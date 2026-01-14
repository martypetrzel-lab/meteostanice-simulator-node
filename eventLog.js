// eventLog.js – B 3.35.1 (frontend-ready event stream)
// Jednoduchý event log do state.events[] + anti-spam.
//
// Cíl:
// - enter/exit události (režimy, noční override, anomálie)
// - anti-spam: stejný klíč ne logovat častěji než minIntervalSec
// - bezpečné i bez DB – držíme jen posledních MAX_EVENTS

const MAX_EVENTS = 240;

function n(x, fallback = 0) {
  const v = Number(x);
  return Number.isFinite(v) ? v : fallback;
}

function nowTs(state) {
  return n(state?.time?.now, Date.now());
}

function keySig(evt) {
  const k = String(evt?.key ?? "GEN");
  const a = String(evt?.action ?? "INFO");
  const l = String(evt?.level ?? "");
  const msg = String(evt?.message ?? "");
  return `${k}|${a}|${l}|${msg}`;
}

function ensure(state) {
  if (!state.events || !Array.isArray(state.events)) state.events = [];
  state._runtime = state._runtime || {};
  state._runtime.eventLog = state._runtime.eventLog || { lastBySig: {} };
}

export function logEvent(state, evt, opts = {}) {
  if (!state || !evt) return;

  ensure(state);

  const ts = nowTs(state);
  const minIntervalSec = n(opts.minIntervalSec, 120);
  const sig = keySig(evt);

  const last = n(state._runtime.eventLog.lastBySig[sig], 0);
  if (last && (ts - last) < minIntervalSec * 1000) return;

  state._runtime.eventLog.lastBySig[sig] = ts;

  const item = {
    ts,
    key: String(evt.key ?? "GEN"),
    action: String(evt.action ?? "INFO"),
    level: evt.level != null ? String(evt.level) : undefined,
    message: String(evt.message ?? ""),
    meta: evt.meta ?? undefined,
  };

  state.events.push(item);
  if (state.events.length > MAX_EVENTS) {
    state.events.splice(0, state.events.length - MAX_EVENTS);
  }
}

export function logTransition(state, key, fromLevel, toLevel, meta = {}) {
  if (!state) return;
  if (fromLevel === toLevel) return;

  // EXIT
  if (fromLevel) {
    logEvent(
      state,
      {
        key,
        action: "EXIT",
        level: fromLevel,
        message: `Odchod z režimu ${fromLevel}.`,
        meta: { ...meta, from: fromLevel, to: toLevel },
      },
      { minIntervalSec: 10 }
    );
  }

  // ENTER
  logEvent(
    state,
    {
      key,
      action: "ENTER",
      level: toLevel,
      message: `Vstup do režimu ${toLevel}.`,
      meta: { ...meta, from: fromLevel, to: toLevel },
    },
    { minIntervalSec: 10 }
  );
}
