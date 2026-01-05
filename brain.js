// brain.js

export function updateBrain(state) {
  const soc = Math.round(state.battery.soc * 100);
  const light = Math.round(state.sensors.light);

  let message = "Čekám na data…";
  let details = [];

  if (soc < 20) {
    message = "Kritická baterie, šetřím energii";
    details.push(`SOC: ${soc} %`);
  } else if (light > 300 && soc < 95) {
    message = "Dostatek energie, nabíjím";
    details.push(`SOC: ${soc} %`);
    details.push(`Světlo: ${light} lx`);
  } else {
    message = "Podmínky stabilní, sbírám data";
    details.push(`SOC: ${soc} %`);
    details.push(`Světlo: ${light} lx`);
  }

  return {
    message,
    details
  };
}
