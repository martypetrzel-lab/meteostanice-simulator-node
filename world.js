export function tickWorld(state) {
  const now = new Date(state.time.now);
  const hour = now.getHours();

  const isDay = hour >= 7 && hour <= 17;
  state.time.isDay = isDay;

  state.world = state.world || {};
  state.world.time = state.time;

  // světlo
  state.world.environment.light = isDay
    ? Math.round(400 + Math.random() * 300)
    : 0;

  // teplota – pomalá změna
  const delta = (Math.random() - 0.5) * 0.05;
  state.world.environment.temperature =
    (state.world.environment.temperature ?? 15) + delta;
}
