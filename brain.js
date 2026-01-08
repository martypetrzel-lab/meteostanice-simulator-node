// brain.js
import { rememberExperience } from "./memory.js";

export function decide(state) {
  const t = state.environment.temperature;
  const battery = state.device.battery;

  // PRIORITA: raději přehřátí než vybití
  if (battery < 15 && t > 30) {
    rememberExperience(state, "energy_priority_overheat", {
      battery,
      temperature: t,
      decision: "risk_overheat"
    });

    state.device.fan = false;
    return;
  }

  if (t > 40) {
    rememberExperience(state, "overheating", {
      temperature: t
    });

    state.device.fan = true;
    return;
  }

  if (battery < 10) {
    rememberExperience(state, "energy_crisis", {
      battery
    });

    state.device.fan = false;
    return;
  }

  state.device.fan = false;
}
