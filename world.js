// world.js
export function worldTick(state) {
  const now = new Date(state.time.now);

  /* ================== ČAS ================== */
  const minutes =
    now.getHours() * 60 +
    now.getMinutes() +
    now.getSeconds() / 60;

  state.world.minuteOfDay = minutes;

  /* ================== SLUNCE ================== */
  // Slunce vychází cca v 6:00 (360), zapadá v 18:00 (1080)
  let sun = 0;
  if (minutes >= 360 && minutes <= 1080) {
    sun = Math.sin(Math.PI * (minutes - 360) / 720);
  }

  /* ================== POČASÍ (PAMĚŤ) ================== */
  if (state.world.cloudiness === undefined) {
    state.world.cloudiness = Math.random() * 0.3;
  }

  // pomalá změna oblačnosti
  state.world.cloudiness += (Math.random() - 0.5) * 0.002;
  state.world.cloudiness = Math.max(0, Math.min(0.9, state.world.cloudiness));

  /* ================== EVENTY ================== */
  if (!state.world.event && Math.random() < 0.0001) {
    state.world.event = {
      type: ["clouds", "cold", "heat"][Math.floor(Math.random() * 3)],
      strength: 0.3 + Math.random() * 0.7,
      ttl: 1800 + Math.random() * 1800 // 30–60 min
    };
  }

  let eventLight = 1;
  let eventTemp = 0;

  if (state.world.event) {
    state.world.event.ttl--;

    if (state.world.event.type === "clouds") {
      eventLight -= 0.6 * state.world.event.strength;
    }

    if (state.world.event.type === "cold") {
      eventTemp -= 3 * state.world.event.strength;
    }

    if (state.world.event.type === "heat") {
      eventTemp += 3 * state.world.event.strength;
    }

    if (state.world.event.ttl <= 0) {
      state.world.event = null;
    }
  }

  /* ================== SVĚTLO ================== */
  const targetLight =
    sun * 1000 *
    (1 - state.world.cloudiness) *
    eventLight;

  if (state.world.light === undefined) {
    state.world.light = targetLight;
  }

  // setrvačnost světla
  state.world.light += (targetLight - state.world.light) * 0.05;

  /* ================== TEPLOTA ================== */
  const baseTempNight = 6;
  const baseTempDay = 18;

  const targetTemp =
    baseTempNight +
    (baseTempDay - baseTempNight) * sun +
    eventTemp;

  if (state.world.temperature === undefined) {
    state.world.temperature = targetTemp;
  }

  // teplota reaguje pomaleji než světlo
  state.world.temperature +=
    (targetTemp - state.world.temperature) * 0.01;

  /* ================== ZAOKROUHLENÍ ================== */
  state.world.light = Math.max(0, Number(state.world.light.toFixed(0)));
  state.world.temperature = Number(state.world.temperature.toFixed(2));
}
