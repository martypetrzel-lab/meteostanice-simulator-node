export function deviceTick(state) {
  const solar = state.time.isDay ? state.world.light / 1000 : 0;
  const load = 0.18;

  const balance = solar - load;

  state.device = {
    temperature: state.world.temperature,
    light: state.world.light,
    battery: {
      voltage: 3.7 + balance * 0.1,
      soc: Math.min(1, Math.max(0, 0.6 + balance * 0.05))
    },
    power: {
      solarInW: Number(solar.toFixed(3)),
      loadW: load,
      balanceWh: Number((balance / 3600).toFixed(6))
    },
    fan: false
  };
}
