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
 * B 3.32.0 (připraveno na budoucí HW):
 * - Solární panel 5V/3W (Voc 6.1V, Isc 665mA)  -> max ~3.0 W
 * - 1× NCR18650B 3350 mAh -> ~9.9 Wh použitelně (80%)
 * - 2× INA219 (příjem/spotřeba) – simuluje se z výkonů
 * - SHT40 (vnitřní T+RH) + DS18B20 (venkovní T)
 *
 * Pozn.: Hardware nikdy „nerozmýšlí“. Tohle je jen fyzikální / senzorová vrstva.
 */
export function deviceTick(state, dtMs = 1000) {
  if (!state.device) state.device = {};
  if (!state.device.config) state.device.config = {};
  if (!state.device.identity) state.device.identity = {};
  if (!state.device.sensors) state.device.sensors = {};
  if (!state.world) state.world = {};
  if (!state.world.environment) state.world.environment = { temperature: 15, light: 0 };

  const cfg = state.device.config;

  // === panel ===
  const panelMaxW = num(cfg.panelMaxW, 3.0);
  const panelEff = num(cfg.panelEff, 0.75);
  const panelVocV = num(cfg.panelVocV, 6.1);
  const panelIscA = num(cfg.panelIscA, 0.665);

  // === battery ===
  const baseLoadW = num(cfg.baseLoadW, 0.18);

  const fanOutW = num(cfg.fanOutW, 1.0); // 5V * 0.2A = 1.0 W
  const stepUpEff = clamp(num(cfg.stepUpEff, 0.85), 0.5, 0.95);
  const stepUpIqW = num(cfg.stepUpIqW, 0.05);

  const batteryWhExplicit = num(cfg.batteryWh, NaN);
  const batteryMah = num(cfg.batteryMah, 3350);
  const batteryNomV = num(cfg.batteryNomV, 3.7);
  const batteryUsableFactor = clamp(num(cfg.batteryUsableFactor, 0.8), 0.3, 0.95);

  const batteryWh = Number.isFinite(batteryWhExplicit)
    ? batteryWhExplicit
    : (batteryMah / 1000) * batteryNomV * batteryUsableFactor; // ~9.9 Wh

  if (!state.device.battery) {
    state.device.battery = { voltage: 3.84, soc: 0.6 };
  }

  if (!state.device.power) {
    state.device.power = { solarInW: 0, loadW: baseLoadW, balanceWh: 0 };
  }

  const env = state.world.environment;

  // Solar input
  const irradianceWm2 = num(env.irradianceWm2, NaN);
  const lightLux = num(env.light, 0);
  const luxToWm2 = (lux) => lux / 120;
  const irr = Number.isFinite(irradianceWm2) ? irradianceWm2 : luxToWm2(lightLux);

  const solarInW_raw = clamp(panelMaxW * (irr / 1000) * panelEff, 0, panelMaxW);

  // Load
  const fanBatteryW = state.device.fan ? (fanOutW / stepUpEff + stepUpIqW) : 0;
  const loadW_raw = baseLoadW + fanBatteryW;

  const netW = solarInW_raw - loadW_raw;
  const dtSec = Math.max(0, num(dtMs, 1000)) / 1000;
  const deltaWh = (netW * dtSec) / 3600;

  const solarInW = Number(solarInW_raw.toFixed(3));
  const loadW = Number(loadW_raw.toFixed(3));

  state.device.power.solarInW = solarInW;
  state.device.power.loadW = loadW;
  state.device.power.balanceWh = Number((num(state.device.power.balanceWh, 0) + deltaWh).toFixed(6));

  // SOC update (fyzika baterie – jednoduchý integrátor; interpretace SoC řeší T 3.33.0 v energy.js)
  const deltaSoc = deltaWh / Math.max(0.1, batteryWh);
  state.device.battery.soc = clamp(num(state.device.battery.soc, 0.6) + deltaSoc, 0, 1);
  state.device.battery.voltage = Number((3.0 + state.device.battery.soc * 1.2).toFixed(2));

  // UI + brain inputs (kompatibilita)
  state.device.battery.percent = Math.round(state.device.battery.soc * 100);
  state.device.battery.capacityWh = Number(batteryWh.toFixed(3));
  state.device.battery.remainingWh = Number((state.device.battery.soc * batteryWh).toFixed(3));

  // legacy identity (aby to bylo konzistentní i pro starší části)
  state.device.identity.batteryWh = Number(batteryWh.toFixed(3));
  state.device.identity.panelMaxW = Number(panelMaxW.toFixed(3));
  state.device.identity.panelVocV = Number(panelVocV.toFixed(3));
  state.device.identity.panelIscA = Number(panelIscA.toFixed(3));

  // =============================
  // Sensor model (future HW ready)
  // =============================
  // SHT40 = vnitřní teplota + vlhkost
  // DS18B20 = venkovní teplota
  const airTempC = num(env.airTempC, num(env.temperature, 0));
  const boxTempC = num(env.boxTempC, airTempC);
  const humidity = num(state.device.humidity, num(env.humidity, 50));

  state.device.sensors.sht40 = {
    tempC: Number(boxTempC.toFixed(2)),
    humidity: Number(humidity.toFixed(1))
  };
  state.device.sensors.ds18b20 = {
    tempC: Number(airTempC.toFixed(2))
  };

  // =============================
  // INA219 (2×): solar in / load out
  // =============================
  // Vstupní větev (panel -> nabíjení)
  const dayFactor = clamp(irr / 1000, 0, 1);
  const inV = solarInW_raw > 0.02
    ? clamp(5.0 + (1 - dayFactor) * 1.1, 4.8, panelVocV)
    : 0;
  const inA = inV > 0 ? (solarInW_raw / inV) : 0;

  // Výstupní větev (baterie -> zátěž)
  const batV = num(state.device.battery.voltage, 3.7);
  const outA = batV > 0 ? (loadW_raw / batV) : 0;

  state.device.sensors.ina219 = {
    ina_in: {
      voltageV: Number(inV.toFixed(3)),
      currentA: Number(inA.toFixed(3)),
      powerW: Number(solarInW_raw.toFixed(3))
    },
    ina_out: {
      voltageV: Number(batV.toFixed(3)),
      currentA: Number(outA.toFixed(3)),
      powerW: Number(loadW_raw.toFixed(3))
    }
  };

  // Sensors mirrors (kompatibilita)
  const t = env.temperature ?? 0;
  state.device.temperature = Number(num(t, 0).toFixed(2));
  if (state.device.humidity === undefined || state.device.humidity === null) state.device.humidity = 50;
  state.device.light = Math.round(lightLux);

  state.device.socPct = state.device.battery.percent;
  state.device.solarInW = solarInW;
  state.device.loadW = loadW;
}
