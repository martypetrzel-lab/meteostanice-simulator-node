export function worldTick(state) {
  const baseTemp = 10 + state.time.dayIndex * 0.2;
  const noise = (Math.random() - 0.5) * 0.5;

  state.world = {
    temperature: baseTemp + noise,
    light: state.time.isDay ? 300 + Math.random() * 400 : 5,
    cloudiness: Math.random()
  };
}
