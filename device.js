export function deviceTick(state) {
  const now = Date.now();

  state.device.lastMeasure ??= 0;

  // měření jen dle intervalu
  if (now - state.device.lastMeasure < state.device.measureInterval * 1000) {
    return;
  }

  state.device.lastMeasure = now;

  const solar = state.world.light / 1000;
  let load = 0.18;

  if (state.device.mode === "eco") load *= 0.6;
  if (state.device.mode === "sleep") load *= 0.3;

  const balance = solar - load;

  state.device.light = Math.round(state.world.light);
  state.device.temperature =
    Number(state.world.temperature.toFixed(2));

  state.device.power.solarInW = Number(solar.toFixed(3));
  state.device.power.loadW = Number(load.toFixed(3));
  state.device.power.balanceWh += balance / 3600;

  state.device.battery.soc = Math.min(
    1,
    Math.max(0, state.device.battery.soc + balance * 0.0005)
  );
}
