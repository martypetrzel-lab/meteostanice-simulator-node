// world.js
// T 3.31.0 – Svět & simulace (UZAVŘENO)
//
// Tento soubor je jediná integrace "světa" do state.
// Všechny výpočty dělá deterministicky WorldSim (sim/world/worldSim.js).
//
// Zásady (tvůj požadavek):
// - svět běží kontinuálně v čase (žádné skoky hodnot)
// - používá scénáře + stresové vzorce, skládá je do 21denních cyklů
// - generuje světlo/solár/venkovní teplotu ve vrstvách: denní rytmus + scénář + krátkodobá variabilita
// - NIKDY nereaguje na chování mozku
// - NEZNÁ baterii ani rozhodnutí mozku

import { WorldSim } from "./sim/world/worldSim.js";

function num(x, fallback = 0) {
  const n = Number(x);
  return Number.isFinite(n) ? n : fallback;
}

// singleton simulace světa (seed drž konstantní = férový dlouhodobý test)
const worldSim = new WorldSim({
  seed: "T 3.31.0",
  latDeg: 50.0755, // Praha
  panelWp: 1.0     // 5V/1W => 1.0 Wp normalizace
});

function safeInitWorld(state) {
  if (!state.world) state.world = {};
  if (!state.world.environment) state.world.environment = {};
  if (!state.world.time) state.world.time = {};
  if (!state.world.sun) state.world.sun = {};
  if (!state.world.cycle) state.world.cycle = {};

  // minimální kompatibilita pro starší části (device.js apod.)
  if (state.world.environment.temperature === undefined) state.world.environment.temperature = 10;
  if (state.world.environment.light === undefined) state.world.environment.light = 0;
}

/**
 * worldTick(state, dtMs)
 * - vstup: state.time.now (reálný čas je nastavován v server.js)
 * - výstup: zapisuje jen do state.world.* (a mirror do state.environment.* pokud existuje)
 */
export function worldTick(state, dtMs = 1000) {
  safeInitWorld(state);

  const ts = num(state.time?.now, Date.now());
  state.world.time.now = ts;

  const w = worldSim.getState(ts);

  // --- zapis do state.world ---
  state.world.environment.temperature = w.environment.temperature;
  state.world.environment.airTempC = w.environment.airTempC;
  state.world.environment.cloud = w.environment.cloud;
  state.world.environment.irradianceWm2 = w.environment.irradianceWm2;
  state.world.environment.light = w.environment.light;
  state.world.environment.solarPotentialW = w.environment.solarPotentialW;

  // metadata (užitečné pro debug / grafy / UI)
  state.world.environment.scenario = w.environment.scenario;
  state.world.environment.stressPattern = w.environment.stressPattern;
  state.world.environment.phase = w.environment.phase;

  state.world.sun = w.sun;
  state.world.cycle = w.cycle;

  // --- volitelný mirror pro kompatibilitu (pokud někde existuje state.environment.*) ---
  if (state.environment) {
    state.environment.temperature = state.world.environment.temperature;
    state.environment.light = state.world.environment.light;
    state.environment.airTempC = state.world.environment.airTempC;
    state.environment.cloud = state.world.environment.cloud;
    state.environment.irradianceWm2 = state.world.environment.irradianceWm2;
    state.environment.solarPotentialW = state.world.environment.solarPotentialW;
  }
}
