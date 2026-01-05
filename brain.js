export function brainDecision(state, prediction) {
  const soc = state.device.battery.soc;
  const temp = state.device.temperature;
  const isDay = state.time.isDay;

  let mode = "ACTIVE";
  let fan = false;
  let reasons = [];
  let confidence = 0.5;

  if (soc < 0.15) {
    mode = "CRITICAL";
    reasons.push("Nízké SOC");
    confidence = 0.95;
  } else if (!isDay && soc < 0.3) {
    mode = "NIGHT";
    reasons.push("Noc + šetření energie");
    confidence = 0.8;
  }

  if (mode === "ACTIVE") {
    if (temp > 30 && soc > 0.3 && isDay) {
      fan = true;
      reasons.push("Vysoká teplota");
      reasons.push("SOC dovoluje");
      confidence = 0.85;
    }

    if (prediction.tempRising && soc > 0.4) {
      fan = true;
      reasons.push("Predikce růstu teploty");
      confidence = 0.9;
    }
  }

  return {
    mode,
    fan,
    reasons,
    confidence
  };
}
