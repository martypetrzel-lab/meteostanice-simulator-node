export function worldTick(state) {
  const hour = new Date(state.time.now).getHours();

  state.environment.light =
    hour >= 7 && hour <= 18
      ? Math.random() * 200 + 200
      : Math.random() * 20;

  state.environment.temperature +=
    (Math.random() - 0.5) * 0.4;
}
