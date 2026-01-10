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

  const light = Number(state.world.environment.light ?? 0);

  // Solar input: 0..1.2W (sim)
  const solarInW_raw = (light / 1000) * 1.2;

  // Load: base + fan
  const baseLoadW = 0.18;
  const fanExtraW = state.device.fan ? 0.35 : 0.0;
  const loadW_raw = baseLoadW + fanExtraW;

  // balance over 1 second (Wh)
  const netW = solarInW_raw - loadW_raw;
  const deltaWh = netW / 3600;

  // Zaokrouhlení do stavu (aby UI neukazovalo 20 desetinných míst)
  const solarInW = Number(solarInW_raw.toFixed(3));
  const loadW = Number(loadW_raw.toFixed(3));

  state.device.power.solarInW = solarInW;
  state.device.power.loadW = loadW;
  state.device.power.balanceWh = Number((state.device.power.balanceWh + deltaWh).toFixed(6));

  // SOC změna: model kapacity baterie (Wh)
  const batteryWh = state.device?.config?.batteryWh ?? 10;
  const deltaSoc = deltaWh / batteryWh;

  state.device.battery.soc = clamp(state.device.battery.soc + deltaSoc, 0, 1);
  state.device.battery.voltage = Number((3.0 + state.device.battery.soc * 1.2).toFixed(2));

  // UI kompatibilita
  state.device.battery.percent = Math.round(state.device.battery.soc * 100);
  state.device.battery.capacityWh = batteryWh;
  state.device.battery.remainingWh = Number((state.device.battery.soc * batteryWh).toFixed(3));

  // “sensor” values on device (zaokrouhlené)
  const t = state.world.environment.temperature ?? 0;
  state.device.temperature = Number(Number(t).toFixed(2));

  // world environment může mít air humidity atd, ale tady pro jednoduchý model držíme “vlhkost”
  // (pokud ji svět nemá, necháme default 50)
  if (state.device.humidity === undefined || state.device.humidity === null) {
    state.device.humidity = 50;
  }

  // light mirror on device
  state.device.light = Math.round(light);

  // --- zrcadla pro UI (aby nepsalo --) ---
  // Spousta UI si bere SOC jako procenta a výkon rovnou z device.*
  state.device.socPct = Math.round(state.device.battery.soc * 100); // 0..100
  state.device.solarInW = solarInW;
  state.device.loadW = loadW;
}
