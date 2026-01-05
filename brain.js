export function brainDecision(state) {
  const soc = state.device.battery.soc;
  const temp = state.device.temperature;
  const event = state.world.event?.type ?? "clear";
  const isDay = state.time.isDay;

  let mode = "ACTIVE";
  let fan = false;
  let reasons = [];
  let confidence = 0.7;

  // ===== KRITICKÉ STAVY =====
  if (soc < 0.12) {
    return {
      mode: "CRITICAL",
      fan: false,
      reasons: ["SOC kriticky nízké"],
      confidence: 0.95
    };
  }

  // ===== EVENT LOGIKA =====
  if (event === "rain" || event === "cloudy") {
    reasons.push("Nízké světlo – event " + event);
    if (!isDay && soc < 0.3) mode = "SAVE";
  }

  if (event === "heatwave") {
    reasons.push("Vlna horka");
    if (temp > 28) fan = true;
  }

  if (event === "frost") {
    reasons.push("Mráz – chlazení zbytečné");
    fan = false;
  }

  // ===== STANDARD =====
  if (temp > 30) {
    fan = true;
    reasons.push("Vysoká teplota");
  }

  // penalizace větráku při slabé energii
  if (fan && soc < 0.35 && !isDay) {
    fan = false;
    reasons.push("Penalizace – energie");
  }

  return { mode, fan, reasons, confidence };
}
