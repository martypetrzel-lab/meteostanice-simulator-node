export function deviceTick(state) {
  // pojistky
  if (!state.device) state.device = {};
  if (!state.device.power) state.device.power = {};
  if (!state.device.battery) state.device.battery = {};

  const hour = new Date(state.time.now).getHours();
  const isNight = hour < 6 || hour >= 18;

  /* ===== SIMULACE ENERGIE ===== */
  const solar = isNight ? 0 : Math.max(0, state.world.light / 1200);
  const load = isNight ? 0.18 : 0.35;

  state.device.power.solarInW = Number(solar.toFixed(3));
  state.device.power.loadW = Number(load.toFixed(3));

  const deltaWh = (solar - load) / 3600;
  state.device.power.balanceWh =
    (state.device.power.balanceWh || 0) + deltaWh;

  /* ===== BATERIE ===== */
  let v = state.device.battery.voltage || 3.7;
  v += deltaWh * 0.8; // jednoduchý přepočet Wh → V
  v = Math.max(3.2, Math.min(4.2, v));
  state.device.battery.voltage = Number(v.toFixed(2));

  /* ===== STAV ZAŘÍZENÍ ===== */
  let mode = "Neznámý stav";

  if (v < 3.4) {
    mode = "KRITICKÁ BATERIE";
  } else if (isNight && v < 3.6) {
    mode = "Kritická noc – šetřím energii";
  } else if (isNight) {
    mode = "Noční úsporný režim";
  } else if (solar > load) {
    mode = "Nabíjím";
  } else {
    mode = "Denní provoz";
  }

  state.device.mode = mode;
}
