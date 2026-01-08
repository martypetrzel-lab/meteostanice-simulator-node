import { rememberExperience } from "./memory.js";

export function decide(state) {
  if (!state.device) state.device = {};
  if (!state.device.battery) state.device.battery = { soc: 0.6, voltage: 3.8 };
  if (!state.world) state.world = { environment: { temperature: 15, light: 0 } };

  const t = state.world.environment.temperature;
  const light = state.world.environment.light;
  const socPct = Math.round(state.device.battery.soc * 100);

  // default message
  state.message = "Podmínky stabilní, sbírám data";
  state.details = [`SOC: ${socPct} %`, `Světlo: ${light} lx`];

  // Kritické přehřátí -> zapnout fan
  if (t > 40) {
    state.device.fan = true;
    state.message = "Přehřátí! Zapínám ventilátor";
    state.details = [`Teplota: ${t.toFixed(1)} °C`, `SOC: ${socPct} %`];
    rememberExperience(state, "overheating", { t, soc: socPct });
    return;
  }

  // Nízká energie -> šetřit
  if (socPct < 10) {
    state.device.fan = false;
    state.message = "Nízká energie – šetřím systém";
    state.details = [`SOC: ${socPct} %`, `Světlo: ${light} lx`];
    rememberExperience(state, "lowEnergy", { soc: socPct });
    return;
  }

  // Střední riziko: pokud je teplo a zároveň málo SOC, fan raději vypnout
  if (t > 33 && socPct < 20) {
    state.device.fan = false;
    state.message = "Teplo, ale energie je málo – riskuji bez ventilátoru";
    state.details = [`Teplota: ${t.toFixed(1)} °C`, `SOC: ${socPct} %`];
    rememberExperience(state, "riskyDecision", { t, soc: socPct, decision: "no_fan_save_energy" });
    return;
  }

  // Jinak fan vypnutý
  state.device.fan = false;
}
