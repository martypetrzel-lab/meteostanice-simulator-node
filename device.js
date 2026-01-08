export function deviceTick(state) {
  if (state.device.fan) {
    state.device.temperature -= 0.3;
    state.energy.out += 0.4;
  } else {
    state.device.temperature += 0.2;
  }
}
