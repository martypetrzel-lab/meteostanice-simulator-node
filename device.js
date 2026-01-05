export function tickDevice(state) {
  const env = state.world.environment;

  state.device.temperature = env.temperature;
  state.device.light = env.light;
  state.device.humidity = 50;

  const solar = env.light / 1200;
  state.device.power.solarInW = Number(solar.toFixed(3));

  const net = solar - state.device.power.loadW;
  state.device.power.balanceWh += net * (5 / 3600);

  state.device.battery.soc = Math.max(
    0,
    Math.min(1, state.device.battery.soc + net * 0.0005)
  );

  state.device.battery.voltage = Number(
    (3.6 + state.device.battery.soc * 0.4).toFixed(2)
  );
}
