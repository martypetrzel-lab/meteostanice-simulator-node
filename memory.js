export function memoryTick(state, label) {
  state.memory.today.temperature.push({
    t: label,
    v: state.device.temperature
  });

  state.memory.today.energyIn.push({
    t: label,
    v: state.device.power.solarInW
  });

  state.memory.today.energyOut.push({
    t: label,
    v: state.device.power.loadW
  });

  for (const k of ["temperature", "energyIn", "energyOut"]) {
    if (state.memory.today[k].length > 600) {
      state.memory.today[k].shift();
    }
  }
}
