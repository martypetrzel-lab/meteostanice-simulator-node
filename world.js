export function worldTick(state) {
  const m = state.time.minuteOfDay;
  const sun = Math.max(0, Math.sin((Math.PI * (m - 360)) / 720));

  if (!state.world.event && Math.random() < 0.002) {
    state.world.event = {
      type: ["clouds", "cold", "heat"][Math.floor(Math.random() * 3)],
      strength: Math.random(),
      ttl: 300 + Math.random() * 900
    };
  }

  let eventTemp = 0;
  let eventLight = 1;

  if (state.world.event) {
    state.world.event.ttl--;
    if (state.world.event.type === "clouds")
      eventLight -= 0.4 * state.world.event.strength;
    if (state.world.event.type === "cold")
      eventTemp -= 3 * state.world.event.strength;
    if (state.world.event.type === "heat")
      eventTemp += 3 * state.world.event.strength;
    if (state.world.event.ttl <= 0) state.world.event = null;
  }

  state.world.light = Math.max(
    0,
    sun * 900 * eventLight + (Math.random() - 0.5) * 40
  );

  state.world.temperature = Number(
    (6 + sun * 12 + eventTemp + (Math.random() - 0.5)).toFixed(2)
  );
}
