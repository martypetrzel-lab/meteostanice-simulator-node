export function deviceTick(state) {
  if (!state.device) state.device = {};

  if (!state.device.battery) {
    state.device.battery = {
      voltage: 3.8,
      soc: 0.6
    };
  }

  if (!state.device.power) {
    state.device.power = {
      solarInW: 0,
      loadW: 0.15,
      balanceWh: 0
    };
  }

  const drain = state.device.fan ? 0.002 : 0.0005;
  state.device.battery.soc = Math.max(
    0,
    state.device.battery.soc - drain
  );

  state.device.battery.voltage =
    3.0 + state.device.battery.soc * 1.2;
}
