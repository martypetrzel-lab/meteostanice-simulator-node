export function deviceTick(state) {
  const solar = state.world.light / 1000;
  const loadBase = 0.18;

  // adaptivní spotřeba
  let load = loadBase;
  if (state.device.mode === "eco") load *= 0.6;
  if (state.device.mode === "sleep") load *= 0.3;

  const balance = solar - load;

  state.device.light = state.world.light;
  state.device.temperature = state.world.temperature;

  state.device.power.solarInW = Number(solar.toFixed(3));
  state.device.power.loadW = Number(load.toFixed(3));
  state.device.power.balanceWh += balance / 3600;

  state.device.battery.soc = Math.min(
    1,
    Math.max(0, state.device.battery.soc + balance * 0.0008)
  );
  state.device.battery.voltage = Number(
    (3.6 + state.device.battery.soc * 0.4).toFixed(2)
  );
}
