// brain.js

export function decide(state) {
  const d = state.device;
  const mem = state.memory.today;

  let fan = d.fan;
  let message = "Stabilní režim";
  let details = [];

  // 🔋 ENERGETICKÉ PRAHY
  const SOC_CRITICAL = 0.2;
  const SOC_LOW = 0.35;
  const TEMP_HIGH = 28;
  const TEMP_TARGET = 24;

  // 📉 Penalizace (uložené do paměti dne)
  let penalty = 0;

  // ☀️ predikce – když je světlo, bude energie
  const solarLikely = d.light > 300;

  // ❗ Kritický SOC → vše vypnout
  if (d.battery.soc < SOC_CRITICAL) {
    fan = false;
    message = "KRITICKÁ BATERIE – nouzový režim";
    details.push("SOC < 20 %");
    penalty += 2;
  }

  // 🔥 Teplo, ale jen pokud si to můžu dovolit
  else if (d.temperature > TEMP_HIGH) {
    if (d.battery.soc > SOC_LOW || solarLikely) {
      fan = true;
      message = "Chladím – teplota vysoká";
      details.push(`Teplota ${d.temperature.toFixed(1)} °C`);
    } else {
      fan = false;
      message = "Teplo, ale šetřím energii";
      penalty += 1;
    }
  }

  // 🎯 Držení cílové teploty
  else if (d.temperature > TEMP_TARGET && d.battery.soc > 0.5) {
    fan = true;
    message = "Jemné chlazení";
  } else {
    fan = false;
    message = "Podmínky stabilní";
  }

  // 📚 ukládáme penalizaci
  if (!state.penalty) state.penalty = 0;
  state.penalty += penalty;

  details.push(`SOC: ${(d.battery.soc * 100).toFixed(0)} %`);
  details.push(`Světlo: ${Math.round(d.light)} lx`);

  return { fan, message, details };
}
