export function deviceTick(state) {
  const d = state.device;
  const w = state.world;

  // solární vstup
  d.power.solarInW = w.light > 50 ? w.light / 400 : 0;

  // zátěž
  d.power.loadW = d.fan ? 1.0 : 0.2;

  const balance = d.power.solarInW - d.power.loadW;

  // baterie
  d.battery.soc += balance * 0.0002;
  d.battery.soc = Math.max(0, Math.min(1, d.battery.soc));

  d.battery.voltage = 3.3 + d.battery.soc * 0.9;

  // teplota zařízení
  if (d.fan) d.temperature -= 0.05;
  else d.temperature += (w.temperature - d.temperature) * 0.01;
}
