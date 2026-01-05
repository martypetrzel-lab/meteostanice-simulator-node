// brain.js

function predictSolar(lightHistory) {
  if (lightHistory.length < 6) return 0;

  const last = lightHistory.slice(-6);
  const avg = last.reduce((a, b) => a + b.v, 0) / last.length;

  // jednoduchá lineární predikce
  return avg;
}

export function decide(state) {
  const d = state.device;
  const mem = state.memory.today;

  let fan = d.fan;
  let message = "Stabilní režim";
  let details = [];
  let penalty = 0;

  const SOC_CRITICAL = 0.2;
  const SOC_LOW = 0.35;

  const predictedLight = predictSolar(mem.light);
  const solarSoon = predictedLight > 250;

  const historicalPenalty =
    mem.penalties.length > 0
      ? mem.penalties.reduce((a, b) => a + b, 0) / mem.penalties.length
      : 0;

  let TEMP_HIGH = 28;
  if (historicalPenalty > 1.5) TEMP_HIGH = 30;

  // 🧠 ROZHODOVÁNÍ S VÝHLEDEM
  if (d.battery.soc < SOC_CRITICAL) {
    fan = false;
    message = "Nouzový režim – nízká baterie";
    penalty += 2;
  } else if (d.temperature > TEMP_HIGH) {
    if (d.battery.soc > SOC_LOW || solarSoon) {
      fan = true;
      message = solarSoon
        ? "Chladím – brzy bude energie"
        : "Chladím – energie dost";
    } else {
      fan = false;
      message = "Teplo, ale predikce říká šetřit";
      penalty += 1;
    }
  } else {
    fan = false;
    message = "Stabilní režim";
  }

  // 📊 ULOŽENÍ PREDIKCE
  mem.predictions.push({
    t: new Date().toLocaleTimeString(),
    predictedLight,
    soc: d.battery.soc
  });

  mem.decisions.push({
    t: new Date().toLocaleTimeString(),
    fan,
    temp: d.temperature,
    soc: d.battery.soc
  });

  mem.penalties.push(penalty);
  state.penalty += penalty;

  details.push(`SOC: ${(d.battery.soc * 100).toFixed(0)} %`);
  details.push(`Pred. light: ${predictedLight.toFixed(0)}`);
  details.push(`Penalty avg: ${historicalPenalty.toFixed(2)}`);

  return { fan, message, details };
}
