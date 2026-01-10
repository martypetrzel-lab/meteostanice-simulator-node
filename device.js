function clamp(v, a, b) {
  return Math.max(a, Math.min(b, v));
}

function num(x, fallback = 0) {
  const n = Number(x);
  return Number.isFinite(n) ? n : fallback;
}

/**
 * device.js – HW-realistic power model defaults
 *
 * Cíl: aby simulace odpovídala reálnému HW:
 * - Solární panel 5V/1W  -> max ~1.0 W
 * - 1× 18650 2200 mAh    -> ~8.14 Wh nominálně, ~6.5 Wh použitelně (80%)
 * - Větrák 5V/200mA      -> 1.0 W na 5V větvi
 * - Step-up MT3608       -> účinnost ~85% + vlastní spotřeba (iq)
 */
export function deviceTick(state) {
  if (!state.device) state.device = {};
  if (!state.device.config) state.device.config = {};
  if (!state.world) state.world = {};
  if (!state.world.environment) state.world.environment = { temperature: 15, light: 0 };

  const cfg = state.device.config;

  // -------- Defaults (můžeš kdykoliv přepsat v state.device.config.*) --------
  const panelMaxW = num(cfg.panelMaxW, 1.0);          // 5V/1W panel
  const panelEff = num(cfg.panelEff, 0.75);           // ztráty: úhel, kabely, nabíjení

  const baseLoadW = num(cfg.baseLoadW, 0.18);         // ESP32 + senzory (sim)

  const fanOutW = num(cfg.fanOutW, 1.0);              // větrák 5V * 0.2A = 1W
  const stepUpEff = clamp(num(cfg.stepUpEff, 0.85), 0.5, 0.95); // MT3608 typicky 80–90%
  const stepUpIqW = num(cfg.stepUpIqW, 0.05);         // vlastní spotřeba step-up při běhu větráku

  // baterie – buď explicitně batteryWh, nebo z mAh
  const batteryWhExplicit = num(cfg.batteryWh, NaN);
  const batteryMah = num(cfg.batteryMah, 2200);
  const batteryNomV = num(cfg.batteryNomV, 3.7);
  const batteryUsableFactor = clamp(num(cfg.batteryUsableFactor, 0.8), 0.3, 0.95);

  const batteryWh = Number.isFinite(batteryWhExplicit)
    ? batteryWhExplicit
    : (batteryMah / 1000) * batteryNomV * batteryUsableFactor; // ~6.5 Wh pro 2200mAh

  // -------- Battery state --------
  if (!state.device.battery) {
    state.device.battery = { voltage: 3.84, soc: 0.6 };
  }

  // -------- Power state --------
  if (!state.device.power) {
    state.device.power = { solarInW: 0, loadW: baseLoadW, balanceWh: 0 };
  }

  const env = state.world.environment;

  // -------- Solar input (REALISTIC) --------
  // Preferujeme irradianceWm2 ze světa (fyzikálnější). Pokud chybí, fallback z lux.
  const irradianceWm2 = num(env.irradianceWm2, NaN);
  const lightLux = num(env.light, 0);

  // hrubý převod pro fallback: daylight ~120 lux na 1 W/m² (řádově)
  const luxToWm2 = (lux) => lux / 120;
  const irr = Number.isFinite(irradianceWm2) ? irradianceWm2 : luxToWm2(lightLux);

  // lineární škálování k panelMaxW při 1000 W/m² (standard test conditions)
  const solarInW_raw = clamp(panelMaxW * (irr / 1000) * panelEff, 0, panelMaxW);

  // -------- Load --------
  // Větrák bere 1W na 5V větvi, z baterky to bude víc kvůli účinnosti step-up.
  const fanBatteryW = state.device.fan ? (fanOutW / stepUpEff + stepUpIqW) : 0;
  const loadW_raw = baseLoadW + fanBatteryW;

  // -------- Energy balance over 1 second (Wh) --------
  const netW = solarInW_raw - loadW_raw;
  const deltaWh = netW / 3600;

  // Zaokrouhlení do stavu
  const solarInW = Number(solarInW_raw.toFixed(3));
  const loadW = Number(loadW_raw.toFixed(3));

  state.device.power.solarInW = solarInW;
  state.device.power.loadW = loadW;
  state.device.power.balanceWh = Number((num(state.device.power.balanceWh, 0) + deltaWh).toFixed(6));

  // -------- SOC update --------
  const deltaSoc = deltaWh / Math.max(0.1, batteryWh);
  state.device.battery.soc = clamp(num(state.device.battery.soc, 0.6) + deltaSoc, 0, 1);

  // Hrubý převod SOC->napětí (jen pro simulaci)
  state.device.battery.voltage = Number((3.0 + state.device.battery.soc * 1.2).toFixed(2));

  // UI kompatibilita
  state.device.battery.percent = Math.round(state.device.battery.soc * 100);
  state.device.battery.capacityWh = Number(batteryWh.toFixed(3));
  state.device.battery.remainingWh = Number((state.device.battery.soc * batteryWh).toFixed(3));

  // -------- Sensor mirrors --------
  const t = env.temperature ?? 0;
  state.device.temperature = Number(num(t, 0).toFixed(2));
  if (state.device.humidity === undefined || state.device.humidity === null) state.device.humidity = 50;
  state.device.light = Math.round(lightLux);

  // Kompatibilní zrcadla pro UI
  state.device.socPct = state.device.battery.percent; // 0..100
  state.device.solarInW = solarInW;
  state.device.loadW = loadW;
}
