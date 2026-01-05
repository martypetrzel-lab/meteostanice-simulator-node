export function updateBrain(state) {
  const soc = Math.round(state.device.battery.soc * 100);
  const light = Math.round(state.device.light);

  let message;
  if (soc < 20) {
    message = "Nízká baterie, šetřím energii";
  } else if (light > 300) {
    message = "Dostatek energie, nabíjím";
  } else {
    message = "Podmínky stabilní, sbírám data";
  }

  return {
    message,
    details: [
      `SOC: ${soc} %`,
      `Světlo: ${light} lx`
    ]
  };
}
