export function tickBrain(state) {
  const soc = Math.round(state.device.battery.soc * 100);
  const light = state.device.light;

  let msg = "Podmínky stabilní, sbírám data";
  const details = [
    `SOC: ${soc} %`,
    `Světlo: ${light} lx`
  ];

  if (soc < 30) msg = "Nízká baterie – omezuji činnost";
  if (light === 0) msg = "Tma – noční režim";

  state.message = msg;
  state.details = details;
}
