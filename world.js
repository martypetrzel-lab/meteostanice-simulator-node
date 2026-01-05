export function worldTick(state) {
  const m = state.time.minuteOfDay;

  const sun = Math.max(0, Math.sin((Math.PI * (m - 360)) / 720));

  // cílové hodnoty (pomalu se mění)
  state.world.targetLight =
    sun * 900 * (1 - (state.world.cloudiness ?? 0));

  state.world.targetTemp =
    6 + sun * 12 + (state.world.event?.type === "cold" ? -3 : 0);

  // plynulý přechod (setrvačnost)
  state.world.light ??= 0;
  state.world.temperature ??= state.world.targetTemp;

  state.world.light +=
    (state.world.targetLight - state.world.light) * 0.02;

  state.world.temperature +=
    (state.world.targetTemp - state.world.temperature) * 0.01;

  // náhodné eventy (zřídka)
  if (!state.world.event && Math.random() < 0.0003) {
    state.world.event = {
      type: ["clouds", "cold", "heat"][Math.floor(Math.random() * 3)],
      ttl: 600 + Math.random() * 1200
    };
  }

  if (state.world.event) {
    state.world.event.ttl--;
    if (state.world.event.ttl <= 0) state.world.event = null;
  }
}
