// device.js
export function deviceTick(state) {
  if (!state.device) {
    state.device = {};
  }

  if (state.device.battery === undefined) {
    state.device.battery = 50;
  }

  const drain = state.device.fan ? 0.2 : 0.05;
  state.device.battery -= drain;

  if (state.device.battery < 0) state.device.battery = 0;
}
