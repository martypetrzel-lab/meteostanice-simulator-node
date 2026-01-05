// brain.js
export function decide(state, memory) {
  const decisions = [];

  // Teplotní logika
  if (state.device.temperature !== null) {
    if (state.device.temperature > 30 && state.device.battery.soc > 0.4) {
      decisions.push({ type: "fan", value: true, reason: "Vysoká teplota" });
    } else {
      decisions.push({ type: "fan", value: false, reason: "Teplota OK" });
    }
  }

  // Energetická logika
  if (state.device.battery.soc < 0.2) {
    decisions.push({
      type: "mode",
      value: "survival",
      reason: "Nízké SOC – šetření"
    });
  }

  return decisions;
}
