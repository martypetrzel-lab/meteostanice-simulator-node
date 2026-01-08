export function decide(state) {
  const d = state.device;
  const w = state.world;

  const LOW_ENERGY = d.battery.soc < 0.25;
  const OVERHEAT = d.temperature > 40;

  if (OVERHEAT && !LOW_ENERGY) {
    d.fan = true;
    state.brain.verdict = "Přehřátí – chladím";
    return;
  }

  if (OVERHEAT && LOW_ENERGY) {
    d.fan = false;
    state.brain.verdict =
      "⚠️ Riskuji přehřátí, energie je kritická. Poučím se.";
    return;
  }

  if (d.temperature < 35) {
    d.fan = false;
    state.brain.verdict = "Podmínky stabilní";
  }
}
