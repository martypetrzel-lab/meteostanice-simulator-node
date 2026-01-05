export function deviceTick(state) {
  const solar = state.time.isDay ? state.world.light / 1000 : 0;
  const load = 0.18;
  const balance = solar - load;

  state.device.temperature = state.world.temperature;
  state.device.light = state.world.light;

  state.device.power = {
    solarInW: Number(solar.toFixed(3)),
    loadW: load,
    balanceWh: Number((balance / 3600).toFixed(6))
  };

  state.device.battery.voltage = Number((3.7 + balance * 0.1).toFixed(2));
  state.device.battery.soc = Math.min(1, Math.max(0, state.device.battery.soc + balance * 0.001));
}
