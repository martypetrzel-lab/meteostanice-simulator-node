function clamp(v, a, b) {
  return Math.max(a, Math.min(b, v));
}

export function deviceTick(state) {
  if (!state.device) state.device = {};
  if (!state.world) state.world = {};
  if (!state.world.environment) state.world.environment = { temperature: 15, light: 0 };

  // Battery model
  if (!state.device.battery) {
    state.device.battery = { voltage: 3.84, soc: 0.6 };
  }

  // Power model
  if (!state.device.power) {
    state.device.power = { solarInW: 0, loadW: 0.18, balanceWh: 0 };
  }

  const light = state.world.environment.light ?? 0;

  // Solar input: cca 0..1.2W podle světla (simulace)
  const solarInW = (light / 1000) * 1.2;

  // Load: základ + fan
  const baseLoadW = 0.18;
  const fanExtraW = state.device.fan ? 0.35 : 0;
  const loadW = baseLoadW + fanExtraW;

  // bilance za 1s (Wh)
  const netW = solarInW - loadW;
  const deltaWh = netW / 3600;

  state.device.power.solarInW = Number(solarInW.toFixed(3));
  state.device.power.loadW = Number(loadW.toFixed(3));
  state.device.power.balanceWh = Number((state.device.power.balanceWh + deltaWh).toFixed(6));

  // SOC změna: beru 10Wh jako “model” baterky (jen simulace)
  const batteryWh = 10;
  const deltaSoc = deltaWh / batteryWh;

  state.device.battery.soc = clamp(state.device.battery.soc + deltaSoc, 0, 1);

  // napětí z SOC (zjednodušeně)
  state.device.battery.voltage = Number((3.0 + state.device.battery.soc * 1.2).toFixed(2));

  // “senzory zařízení” (přibližně)
  state.device.temperature = Number((state.world.environment.temperature ?? 0).toFixed(2));
  if (state.device.humidity === undefined) state.device.humidity = 50;
  state.device.light = light;
}
