export function worldTick(state) {
  const baseTemp = 10 + (state.time.dayIndex ?? 0) * 0.2;
  const noise = (Math.random() - 0.5) * 0.5;

  const temperature = Number((baseTemp + noise).toFixed(2));

  state.world.temperature = temperature;
  state.world.light = state.time.isDay ? 300 + Math.random() * 400 : 5;
  state.world.cloudiness = Math.random();
}
