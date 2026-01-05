export function memoryTick(state, label) {
  const temp = state.device.temperature;

  if (typeof temp === "number") {
    state.memory.today.temperature.push({
      t: label,
      v: Number(temp.toFixed(2))
    });
  }

  state.memory.today.energyIn.push({
    t: label,
    v: state.device.power.solarInW
  });

  state.memory.today.energyOut.push({
    t: label,
    v: state.device.power.loadW
  });

  for (const key of ["temperature", "energyIn", "energyOut"]) {
    if (state.memory.today[key].length > 300) {
      state.memory.today[key].shift();
    }
  }
}
