// world.js
// Simulace reálného světa (den / noc, světlo, teplota)

export function worldTick(state) {
  const now = new Date(state.time.now);

  const hour = now.getHours() + now.getMinutes() / 60;

  /* ===================== DEN / NOC ===================== */
  const DAY_START = 6;   // 06:00
  const DAY_END = 20;    // 20:00
  const DAY_LENGTH = DAY_END - DAY_START;

  let daylightFactor = 0;

  if (hour >= DAY_START && hour <= DAY_END) {
    const x = (hour - DAY_START) / DAY_LENGTH;
    // plynulý náběh + plynulý pokles
    daylightFactor = Math.sin(Math.PI * x);
  } else {
    daylightFactor = 0;
  }

  /* ===================== SVĚTLO ===================== */
  const MAX_LUX = 1000; // venkovní rozumné maximum
  state.world.light = Math.round(MAX_LUX * daylightFactor);

  /* ===================== TEPLOTA ===================== */
  const NIGHT_TEMP = 10;  // °C
  const DAY_TEMP = 18;    // °C

  const targetTemp =
    NIGHT_TEMP + (DAY_TEMP - NIGHT_TEMP) * daylightFactor;

  // setrvačnost – svět se mění pomalu
  if (typeof state.world.temperature !== "number") {
    state.world.temperature = targetTemp;
  } else {
    const INERTIA = 0.01; // čím menší, tím pomalejší změna
    state.world.temperature +=
      (targetTemp - state.world.temperature) * INERTIA;
  }
}
