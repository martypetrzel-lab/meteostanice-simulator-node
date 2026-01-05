export function brainDecision(state) {
  const mem = state.memory.today;
  const soc = state.device.battery.soc;
  const temp = state.device.temperature;
  const isDay = state.time.isDay;

  /* ===== TRENDY ===== */
  const lastTemps = mem.temperature.slice(-3);
  const lastLights = mem.light.slice(-3);

  const tempTrend =
    lastTemps.length >= 2
      ? lastTemps[lastTemps.length - 1].v -
        lastTemps[0].v
      : 0;

  const lightTrend =
    lastLights.length >= 2
      ? lastLights[lastLights.length - 1].v -
        lastLights[0].v
      : 0;

  /* ===== PREDIKCE ===== */
  const tempWillRise = tempTrend > 0.3;
  const lightDropping = lightTrend < -200;
  const solarWeak = !isDay || state.device.light < 20000;

  /* ===== REŽIMY ===== */
  let mode = "ACTIVE";
  let fan = false;
  let reasons = [];
  let confidence = 0.6;

  if (soc < 0.12) {
    mode = "CRITICAL";
    reasons.push("SOC kriticky nízké");
    confidence = 0.95;
    return { mode, fan, reasons, confidence };
  }

  if (!isDay && soc < 0.25) {
    mode = "NIGHT_SAVE";
    reasons.push("Noc – šetření energie");
    confidence = 0.85;
  }

  /* ===== ROZHODOVÁNÍ VĚTRÁKU ===== */
  if (mode === "ACTIVE") {
    if (temp > 30) {
      fan = true;
      reasons.push("Teplota vysoká");
    }

    if (tempWillRise) {
      fan = true;
      reasons.push("Trend: teplota roste");
    }

    if (fan && solarWeak && soc < 0.35) {
      fan = false;
      reasons.push("Penalizace: slabé nabíjení");
      confidence = 0.8;
    }
  }

  /* ===== OCHRANA ===== */
  if (fan && temp < 26 && !tempWillRise) {
    fan = false;
    reasons.push("Teplota stabilní – větrák vypnut");
  }

  return {
    mode,
    fan,
    reasons,
    confidence
  };
}
