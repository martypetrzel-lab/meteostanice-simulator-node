export function tickMemory(state) {
  const now = new Date(state.time.now);
  const label = now.toLocaleTimeString("cs-CZ", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit"
  });

  const mem = state.memory.today;

  mem.temperature.push({
    t: label,
    v: Number(state.device.temperature.toFixed(2))
  });

  mem.energyIn.push({
    t: label,
    v: state.device.power.solarInW
  });

  mem.energyOut.push({
    t: label,
    v: state.device.power.loadW
  });
}
