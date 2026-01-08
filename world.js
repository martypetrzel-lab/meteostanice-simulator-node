function clamp(v, a, b) {
  return Math.max(a, Math.min(b, v));
}

export function worldTick(state) {
  if (!state.time) state.time = { now: Date.now(), isDay: true };
  if (!state.world) state.world = {};
  if (!state.world.environment) state.world.environment = {};

  // 24h cyklus
  const dayMs = 24 * 60 * 60 * 1000;
  const phase = (state.time.now % dayMs) / dayMs; // 0..1

  // slunce: sin posun, aby "noc" byla kolem půlnoci
  const sun = Math.sin((phase - 0.25) * 2 * Math.PI); // -1..1
  const lightNorm = clamp((sun + 0.12) / 1.12, 0, 1); // delší přechody
  const light = Math.round(lightNorm * 1000);

  // teplota: základ + vliv světla + mikrovlna
  const micro = Math.sin(state.time.now / 900000) * 0.6;
  const temperature = 8 + lightNorm * 18 + micro;

  state.world.environment.light = light;
  state.world.environment.temperature = temperature;

  state.world.time = state.time;
  state.time.isDay = light > 120;
}
