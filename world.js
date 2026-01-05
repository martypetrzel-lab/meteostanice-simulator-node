export function simulateWorld(state, hour, deltaMs) {
  state.world ??= {};
  state.world.event ??= generateDailyEvent(state);

  const event = state.world.event;

  // ===== ZÁKLADNÍ DEN/NOC =====
  let baseLight = state.time.isDay
    ? Math.max(0, Math.sin((hour - 6) / 14 * Math.PI)) * 80000
    : 0;

  let baseTemp = 12 + Math.sin((hour - 6) / 24 * Math.PI * 2) * 8;

  // ===== EVENT DOPAD =====
  if (event.type === "rain") {
    baseLight *= 0.15;
    baseTemp -= 2;
  }

  if (event.type === "cloudy") {
    baseLight *= 0.4;
  }

  if (event.type === "heatwave") {
    baseTemp += 8;
  }

  if (event.type === "frost") {
    baseTemp -= 6;
  }

  if (event.type === "front") {
    baseLight *= 0.5;
    baseTemp += Math.sin(hour * 4) * 3;
  }

  state.world.environment = {
    temperature: Number(baseTemp.toFixed(2)),
    light: Math.round(baseLight)
  };

  // přenos do zařízení
  state.device.light = state.world.environment.light;

  // pomalá teplotní setrvačnost zařízení
  state.device.temperature +=
    (state.world.environment.temperature - state.device.temperature) * 0.05;
}

function generateDailyEvent(state) {
  const dayKey = new Date(state.time.now).toDateString();
  state._eventHistory ??= {};

  if (state._eventHistory[dayKey]) {
    return state._eventHistory[dayKey];
  }

  const roll = Math.random();
  let event;

  if (roll < 0.15) event = { type: "rain" };
  else if (roll < 0.35) event = { type: "cloudy" };
  else if (roll < 0.5) event = { type: "heatwave" };
  else if (roll < 0.6) event = { type: "frost" };
  else if (roll < 0.75) event = { type: "front" };
  else event = { type: "clear" };

  state._eventHistory[dayKey] = event;
  return event;
}
