// brain.js
export function decide(state) {
  const decisions = {
    fan: false,
    reason: []
  };

  const temp = state.device.temperature;
  const soc = state.device.battery.soc;
  const solar = state.device.power.solarInW;

  // 🌡️ chlazení – ale s rozumem
  if (temp !== null && temp > 28) {
    if (soc > 0.35 || solar > 0.3) {
      decisions.fan = true;
      decisions.reason.push("Teplota vysoká, energie OK");
    } else {
      decisions.reason.push("Teplo, ale šetřím energii");
    }
  }

  // 🔋 ochrana baterie
  if (soc < 0.25) {
    decisions.fan = false;
    decisions.reason.push("Nízké SOC – ochrana baterie");
  }

  return decisions;
}
