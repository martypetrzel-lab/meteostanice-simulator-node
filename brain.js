export function updateBrain(state) {
  const soc = state.device.battery.soc;
  const light = state.device.light;
  const mem = state.memory.stats;

  // klouzavé průměry (učení)
  mem.avgLight = mem.avgLight * 0.98 + light * 0.02;
  mem.avgBalance =
    mem.avgBalance * 0.98 +
    (state.device.power.solarInW - state.device.power.loadW) * 0.02;

  let mode = "normal";
  let message = "Běžný provoz";
  const details = [];

  if (soc < 0.25 || mem.avgBalance < -0.05) {
    mode = "eco";
    message = "Šetřím energii – nepříznivé podmínky";
  }

  if (soc < 0.15) {
    mode = "sleep";
    message = "Kritický stav – spánkový režim";
  }

  if (light < 50 && mem.avgLight < 100) {
    details.push("Dlouhodobě málo světla");
  }

  state.device.mode = mode;

  details.push(`Režim: ${mode}`);
  details.push(`SOC: ${(soc * 100).toFixed(0)} %`);
  details.push(`Prům. světlo: ${mem.avgLight.toFixed(0)} lx`);

  if (state.world.event) {
    details.push(`Událost: ${state.world.event.type}`);
  }

  return { message, details };
}
