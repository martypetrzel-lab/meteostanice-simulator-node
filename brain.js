export function updateBrain(state) {
  const now = Date.now();
  state.brain ??= {};
  state.brain.lastDecision ??= 0;

  // mozek přemýšlí max 1× za minutu
  if (now - state.brain.lastDecision < 60000) {
    return {
      message: state.message,
      details: state.details
    };
  }

  state.brain.lastDecision = now;

  const soc = state.device.battery.soc;
  const light = state.device.light;
  const stats = state.memory.stats;

  let mode = "normal";
  let measureInterval = 60;
  let message = "Stabilní provoz";

  if (soc < 0.2) {
    mode = "eco";
    measureInterval = 120;
    message = "Nízká baterie – omezuji činnost";
  }

  if (soc < 0.1) {
    mode = "sleep";
    measureInterval = 300;
    message = "Kritický stav – spánek";
  }

  if (light > 500 && soc > 0.6) {
    measureInterval = 30;
    message = "Dobré podmínky – zvýšený sběr";
  }

  state.device.mode = mode;
  state.device.measureInterval = measureInterval;

  return {
    message,
    details: [
      `Režim: ${mode}`,
      `Interval měření: ${measureInterval}s`,
      `SOC: ${(soc * 100).toFixed(0)} %`
    ]
  };
}
