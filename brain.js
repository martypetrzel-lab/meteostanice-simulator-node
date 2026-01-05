export function updateBrain(state) {
  const soc = state.device.battery.soc;
  const light = state.device.light;
  const balance =
    state.device.power.solarInW - state.device.power.loadW;

  const stats = state.memory.stats;

  // 📊 učení z historie
  const prevAvg = stats.avgLight;
  stats.avgLight = stats.avgLight * 0.97 + light * 0.03;
  stats.avgBalance =
    stats.avgBalance * 0.97 + balance * 0.03;

  stats.trendLight = stats.avgLight - prevAvg;

  let mode = "normal";
  let interval = 15;
  let message = "Stabilní provoz";
  const details = [];

  // 🔮 predikce
  if (stats.trendLight < -5) {
    details.push("Světelné podmínky se zhoršují");
  }
  if (stats.trendLight > 5) {
    details.push("Podmínky se zlepšují");
  }

  // ⚡ rozhodování
  if (soc < 0.2 || stats.avgBalance < -0.05) {
    mode = "eco";
    interval = 30;
    message = "Šetřím energii – očekávám nedostatek";
  }

  if (soc < 0.12) {
    mode = "sleep";
    interval = 60;
    message = "Kritický stav – minimální aktivita";
  }

  if (soc > 0.7 && stats.avgBalance > 0.1) {
    interval = 5;
    message = "Dostatek energie – zvýšený sběr dat";
  }

  state.device.mode = mode;
  state.device.sampleInterval = interval;

  details.push(`Režim: ${mode}`);
  details.push(`Interval měření: ${interval}s`);
  details.push(`SOC: ${(soc * 100).toFixed(0)} %`);
  details.push(`Trend světla: ${stats.trendLight.toFixed(1)}`);

  if (state.world.event) {
    details.push(`Událost: ${state.world.event.type}`);
  }

  return { message, details };
}
