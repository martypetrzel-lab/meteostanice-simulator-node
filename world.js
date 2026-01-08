function clamp(v, a, b) {
  return Math.max(a, Math.min(b, v));
}

export function worldTick(state) {
  if (!state.world) state.world = {};
  if (!state.world.environment) state.world.environment = {};
  if (!state.time) state.time = { now: Date.now(), isDay: true };

  // Denní cyklus (24h): světlo 0..1000
  const dayMs = 24 * 60 * 60 * 1000;
  const phase = (state.time.now % dayMs) / dayMs; // 0..1
  // sin posunutý tak, aby “noc” byla kolem půlnoci
  const sun = Math.sin((phase - 0.25) * 2 * Math.PI); // -1..1
  const lightNorm = clamp((sun + 0.1) / 1.1, 0, 1); // trochu delší svítání
  const light = Math.round(lightNorm * 1000);

  state.world.environment.light = light;

  // Teplota: základ + vliv světla + drobná náhodná mikrokřivka
  const micro = Math.sin(state.time.now / 900000) * 0.6; // pomalé vlnění
  state.world.environment.temperature = 8 + lightNorm * 18 + micro;

  state.world.time = state.time;
  state.time.isDay = light > 120;
}
