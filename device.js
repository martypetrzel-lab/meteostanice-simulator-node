// device.js

export function deviceTick(state) {
  /* === DEFENZIVNÍ INIT === */
  state.device ??= {};
  state.device.power ??= {};
  state.device.battery ??= {};

  const isDay = state.time?.isDay ?? true;

  /* === SIMULACE SOLARU === */
  const solar = isDay ? Math.random() * 2.5 : 0;
  const load = 0.18;

  state.device.power.solarInW = Number(solar.toFixed(3));
  state.device.power.loadW = Number(load.toFixed(3));

  const balance = solar - load;
  state.device.power.balanceWh =
    (state.device.power.balanceWh ?? 0) + balance / 3600;

  /* === BATERIE === */
  const voltage =
    3.7 +
    Math.min(Math.max(state.device.power.balanceWh, -1), 1) * 0.1;

  state.device.battery.voltage = Number(voltage.toFixed(3));

  /* === STAV === */
  state.device.mode =
    solar > load ? "NABÍJENÍ" :
    solar === 0 ? "NOC" :
    "VYBÍJENÍ";
}
