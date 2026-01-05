export function brainTick(state) {
  const soc = state.device.battery.soc;
  const light = state.world.light;

  if (soc < 0.3) {
    state.brain.message = "Nedostatek energie, šetřím";
  } else if (light > 200) {
    state.brain.message = "Dostatek energie, nabíjím";
  } else {
    state.brain.message = "Podmínky stabilní, sbírám data";
  }

  state.brain.details = [
    `SOC: ${(soc * 100).toFixed(0)} %`,
    `Světlo: ${Math.round(light)} lx`,
    `Den: ${state.time.dayIndex} / 21`
  ];
}
