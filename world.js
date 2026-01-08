export function worldTick(state) {
  if (!state.world) state.world = {};
  if (!state.world.environment) state.world.environment = {};

  const light =
    Math.max(0, Math.sin(state.time.now / 60000) * 100);

  state.world.environment.light = light;
  state.world.environment.temperature = 20 + light * 0.2;

  state.world.time = state.time;
}
