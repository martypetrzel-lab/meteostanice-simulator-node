export function simulateWorld(state, hours, deltaMs) {
  /* ===== SVĚTLO ===== */
  let lightBase = 0;
  if (hours >= 6 && hours <= 20) {
    const x = (hours - 6) / 14;
    lightBase = Math.sin(Math.PI * x) * 100000;
  }

  // mraky – pomalé změny
  if (!state.world.cloudiness) state.world.cloudiness = Math.random();
  state.world.cloudiness += (Math.random() - 0.5) * 0.01;
  state.world.cloudiness = Math.max(0, Math.min(1, state.world.cloudiness));

  const cloudPenalty = state.world.cloudiness * 60000;
  state.device.light = Math.max(0, lightBase - cloudPenalty);

  /* ===== TEPLOTA ===== */
  const dayTarget = 22;
  const nightTarget = 8;
  const targetTemp = hours >= 6 && hours <= 20 ? dayTarget : nightTarget;

  const diff = targetTemp - state.device.temperature;
  state.device.temperature += diff * 0.0008 * (deltaMs / 1000);
  state.device.temperature += (Math.random() - 0.5) * 0.02;
}
