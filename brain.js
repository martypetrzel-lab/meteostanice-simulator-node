// brain.js

export function updateBrain(state) {
  if (!state.device || !state.device.battery || !state.device.power) {
    return;
  }

  const soc = state.device.battery.soc;          // 0–1
  const light = state.device.light || 0;
  const balance =
    state.device.power.solarInW - state.device.power.loadW;

  /* ================== VÝCHOZÍ STAV ================== */
  if (!state.device.mode) {
    state.device.mode = "INIT";
  }

  let newMode = state.device.mode;
  let message = state.message;

  /* ================== ROZHODOVÁNÍ ================== */

  // Kritický stav
  if (soc < 0.15) {
    newMode = "CRITICAL";
    message = "Kritický stav baterie, omezuji provoz";
  }

  // Úsporný režim
  else if (soc < 0.3) {
    newMode = "SAVING";
    message = "Nízká kapacita baterie, šetřím energii";
  }

  // Noc
  else if (!state.time.isDay) {
    newMode = "NIGHT";
    message = "Noc – minimální aktivita";
  }

  // Nabíjení
  else if (balance > 0.05) {
    newMode = "CHARGING";
    message = "Dostatek energie, nabíjím";
  }

  // Normální provoz
  else {
    newMode = "ACTIVE";
    message = "Normální provoz";
  }

  /* ================== APLIKACE ZMĚNY ================== */
  if (newMode !== state.device.mode) {
    state.device.mode = newMode;
    state.message = message;
  }
}
