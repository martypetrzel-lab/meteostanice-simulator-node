// world.js
export function worldTick(state) {
  if (!state.environment) {
    state.environment = {};
  }

  state.environment.light = Math.max(
    0,
    Math.sin(state.time.now / 60000) * 100
  );

  state.environment.temperature =
    20 + state.environment.light * 0.2;
}
