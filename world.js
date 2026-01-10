// world.js
// T 3.31.0 – Svět & simulace (UZAVŘENO)
//
// Tento soubor je jediná integrace "světa" do state.
// Všechny výpočty dělá deterministicky WorldSim (sim/world/worldSim.js).
//
// Zásady:
// - svět běží kontinuálně v čase (žádné skoky hodnot)
// - používá scénáře + stresové vzorce, skládá je do 21denních cyklů
// - generuje světlo/solár/venkovní teplotu ve vrstvách: denní rytmus + scénář + krátkodobá variabilita
// - NIKDY nereaguje na chování mozku
// - NEZNÁ baterii ani rozhodnutí mozku
//
// B 3.34.0 doplněk:
// - do state.world.environment.sun zrcadlím state.world.sun, protože mozek čte env.sun z environment.
//   (nemění to svět, jen zpřístupňuje data konzistentně)

import { WorldSim } from "./sim/world/worldSim.js";

function num(x, fallback = 0) {
  const n = Number(x);
  return Number.isFinite(n) ? n : fallback;
}

const worldSim = new WorldSim({
  seed: "T 3.31.0",
  latDeg: 50.0755,
  panelWp: 3.0
});

function safeInitWorld(state) {
  if (!state.world) state.world = {};
  if (!state.world.environment) state.world.environment = {};
  if (!state.world.time) state.world.time = {};
  if (!state.world.sun) state.world.sun = {};
  if (!state.world.cycle) state.world.cycle = {};

  if (state.world.environment.temperature === undefined) state.world.environment.temperature = 10;
  if (state.world.environment.light === undefined) state.world.environment.light = 0;
}

export function worldTick(state, dtMs = 1000) {
  safeInitWorld(state);

  const ts = num(state.time?.now, Date.now());
  state.world.time.now = ts;

  const w = worldSim.getState(ts);

  state.world.environment.temperature = w.environment.temperature;
  state.world.environment.airTempC = w.environment.airTempC;
  state.world.environment.cloud = w.environment.cloud;
  state.world.environment.irradianceWm2 = w.environment.irradianceWm2;
  state.world.environment.light = w.environment.light;
  state.world.environment.solarPotentialW = w.environment.solarPotentialW;

  state.world.environment.scenario = w.environment.scenario;
  state.world.environment.stressPattern = w.environment.stressPattern;
  state.world.environment.phase = w.environment.phase;

  state.world.sun = w.sun;
  state.world.cycle = w.cycle;

  // ✅ B 3.34.0: mozek čte env.sun z environment, proto zrcadlo:
  state.world.environment.sun = { ...(state.world.environment.sun || {}), ...state.world.sun };

  if (state.environment) {
    state.environment.temperature = state.world.environment.temperature;
    state.environment.light = state.world.environment.light;
    state.environment.airTempC = state.world.environment.airTempC;
    state.environment.cloud = state.world.environment.cloud;
    state.environment.irradianceWm2 = state.world.environment.irradianceWm2;
    state.environment.solarPotentialW = state.world.environment.solarPotentialW;
    // mirror sun (pokud někdo používá legacy)
    state.environment.sun = state.world.environment.sun;
  }
}
