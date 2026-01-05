import World from "./world.js";

export default class Simulator {
  constructor(state = {}) {
    this.state = state;

    // ===== TIME =====
    this.state.time ??= { now: Date.now(), lastTick: Date.now() };

    // ===== DEVICE =====
    this.state.device ??= {};
    this.state.device.temperature ??= 15;
    this.state.device.light ??= 0;
    this.state.device.humidity ??= 50;
    this.state.device.fan ??= false;

    this.state.device.battery ??= {
      voltage: 3.8,
      soc: 0.6
    };

    this.state.device.power ??= {
      solarInW: 0,
      loadW: 0,
      balanceWh: 0
    };

    // ===== MEMORY =====
    this.state.memory ??= {};
    this.state.memory.today ??= {};
    this.state.memory.today.temperature ??= [];
    this.state.memory.today.light ??= [];
    this.state.memory.today.energyIn ??= [];
    this.state.memory.today.energyOut ??= [];

    this.state.memory.history ??= { days: [] };

    // ===== WORLD =====
    this.world = new World(this.state);

    // ===== INTERNAL =====
    this.lastMeasure = 0;
    this.penalty = 0;
  }

  tick() {
    const now = Date.now();
    const deltaH = (now - this.state.time.lastTick) / 3600000;
    this.state.time.lastTick = now;
    this.state.time.now = now;

    // 🌍 svět
    this.world.tick(now);

    // 📥 světlo
    this.state.device.light = this.state.world.environment.light;

    // ⚡ energie
    this.computeEnergy(deltaH);

    // 🌬️ mozek – větrák
    this.decideFan();

    // 🌡️ fyzika teploty
    this.simulateTemperature(deltaH);

    // 📝 měření
    this.measure(now);
  }

  computeEnergy(deltaH) {
    const light = this.state.device.light;

    // solár ~ 0–1W
    const solar = Math.min(1, light / 100000);
    const fanLoad = this.state.device.fan ? 1.0 : 0.2;

    this.state.device.power.solarInW = Number(solar.toFixed(3));
    this.state.device.power.loadW = fanLoad;

    const balance = (solar - fanLoad) * deltaH;
    this.state.device.power.balanceWh += balance;

    this.state.device.battery.soc = Math.min(
      1,
      Math.max(0, this.state.device.battery.soc + balance / 5)
    );
  }

  decideFan() {
    const t = this.state.device.temperature;
    const soc = this.state.device.battery.soc;

    if (t > 28 && soc > 0.25) {
      this.state.device.fan = true;
    } else if (t < 24 || soc < 0.15) {
      this.state.device.fan = false;
    }

    if (t > 30 && soc < 0.15) {
      this.penalty += 1;
    }
  }

  simulateTemperature(deltaH) {
    const env = this.state.world.environment.temperature;
    let t = this.state.device.temperature;

    // přiblížení k okolí
    t += (env - t) * 0.05 * deltaH;

    // větrák chladí
    if (this.state.device.fan) {
      t -= 0.8 * deltaH;
    }

    // šum
    t += (Math.random() - 0.5) * 0.02;

    this.state.device.temperature = Number(t.toFixed(2));
  }

  measure(now) {
    if (now - this.lastMeasure < 5000) return;
    this.lastMeasure = now;

    const ts = new Date(now).toLocaleTimeString();

    this.state.memory.today.temperature.push({
      t: ts,
      v: this.state.device.temperature
    });

    this.state.memory.today.light.push({
      t: ts,
      v: Math.round(this.state.device.light)
    });

    this.state.memory.today.energyIn.push({
      t: ts,
      v: this.state.device.power.solarInW
    });

    this.state.memory.today.energyOut.push({
      t: ts,
      v: this.state.device.power.loadW
    });
  }

  getState() {
    this.state.message =
      this.penalty > 0
        ? "⚠️ Energetický stres – optimalizuji"
        : "Podmínky stabilní, systém v rovnováze";

    this.state.details = [
      `SOC: ${(this.state.device.battery.soc * 100).toFixed(0)} %`,
      `Větrák: ${this.state.device.fan ? "ZAP" : "VYP"}`,
      `Penalty: ${this.penalty}`
    ];

    return this.state;
  }
}
