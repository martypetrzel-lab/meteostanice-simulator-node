import { createDaySummary } from "./memorySchema.js";

export function memoryTick(state) {
  if (!state.memory.today) {
    state.memory.today = createDaySummary();
  }

  const m = state.memory.today;
  const d = state.device;

  m.minTemp = m.minTemp === null ? d.temperature : Math.min(m.minTemp, d.temperature);
  m.maxTemp = m.maxTemp === null ? d.temperature : Math.max(m.maxTemp, d.temperature);

  if (d.battery.soc < 0.2) m.energyLow = true;
  if (d.temperature > 40) m.overheated = true;

  if (m.energyLow && m.overheated) {
    m.note =
      "EIRA riskovala přehřátí, aby přežila energeticky. Učí se.";
  }
}
