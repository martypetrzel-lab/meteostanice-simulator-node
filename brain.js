// brain.js

export function decide(state) {
  const d = state.device;
  const mem = state.memory.today;

  let fan = d.fan;
  let message = "Stabilní režim";
  let details = [];
  let penalty = 0;

  // 🎯 Adaptivní prahy (učí se)
  const historicalPenalty =
    mem.penalties.length > 0
      ? mem.penalties.reduce((a, b) => a + b, 0) / mem.penalties.length
      : 0;

  let TEMP_HIGH = 28;
  if (historicalPenalty > 1) TEMP_HIGH = 30; // učí se šetřit

  const SOC_CRITICAL = 0.2;
  const SOC_LOW = 0.35;

  const solarLikely = d.light > 300;

  if (d.battery.soc < SOC_CRITICAL) {
    fan = false;
    message = "Nouzový režim – šetřím energii";
    penalty += 2;
  } else if (d.temperature > TEMP_HIGH) {
    if (d.battery.soc > SOC_LOW || solarLikely) {
      fan = true;
      message = "Chladím – vyhodnoceno jako bezpečné";
    } else {
      fan = false;
      message = "Teplo, ale minulost říká šetřit";
      penalty += 1;
    }
  } else {
    fan = false;
    message = "Stabilní režim";
  }

  // 🧠 ULOŽENÍ ROZHODNUTÍ
  mem.decisions.push({
    t: new Date().toLocaleTimeString(),
    fan,
    temp: d.temperature,
    soc: d.battery.soc
  });

  mem.penalties.push(penalty);
  state.penalty += penalty;

  details.push(`SOC: ${(d.battery.soc * 100).toFixed(0)} %`);
  details.push(`Penalty avg: ${historicalPenalty.toFixed(2)}`);

  return { fan, message, details };
}
