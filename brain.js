import { rememberExperience } from "./memory.js";

export function decide(state) {
  const exp = state.memory.experiences;

  let verdict = "STABILNÍ";

  const overheatingRisk = state.device.temperature > 65;
  const lowEnergyRisk = state.energy.soc < 20;

  if (lowEnergyRisk && !overheatingRisk) {
    verdict = "RIZIKO_PŘEHŘÁTÍ";
    state.device.fan = true;
    rememberExperience(state, "riskyDecision");
  }

  if (overheatingRisk) {
    verdict = "PŘEHŘÁTÍ";
    rememberExperience(state, "overheating");
    state.device.fan = true;
  }

  if (lowEnergyRisk) {
    rememberExperience(state, "lowEnergy");
  }

  state.brain.lastVerdict = verdict;
  state.brain.message =
    verdict === "STABILNÍ"
      ? "Podmínky jsou vyrovnané."
      : "Riskovala jsem. Pamatuji si to.";
}
