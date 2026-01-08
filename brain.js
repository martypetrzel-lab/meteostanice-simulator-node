import { rememberExperience } from "./memory.js";

export function decide(state) {
  const t = state.world.environment.temperature;
  const soc = state.device.battery.soc * 100;

  if (t > 40) {
    rememberExperience(state, "overheating", { t, soc });
    state.device.fan = true;
    return;
  }

  if (soc < 10) {
    rememberExperience(state, "lowEnergy", { soc });
    state.device.fan = false;
    return;
  }

  state.device.fan = false;
}
