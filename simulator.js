### SIMULATOR VERSION 2026-01-05 NO ASSERT ###

import fs from "fs";

export class Simulator {
  constructor() {
    this.state = this.loadState();
    this.lastTick = Date.now();
  }

  loadState() {
    try {
      const raw = fs.readFileSync("./state.json", "utf-8");
      const s = JSON.parse(raw);

      // tvrdá inicializace chybějících větví
      s.power ??= {};
      s.power.solarInW ??= 0;
      s.power.loadW ??= 0;
      s.power.balanceWh ??= 0;

      s.device ??= {};
      s.device.battery ??= {};
      s.device.battery.voltage ??= 3.7;
      s.device.battery.soc ??= 0.5;

      s.memory ??= {};
      s.memory.today ??= {};
      s.memory.today.temperature ??= [];
      s.memory.today.energyIn ??= [];
      s.memory.today.energyOut ??= [];

      return s;
    } catch (e) {
      console.error("State load failed, creating default state");

      return {
        time: { now: Date.now(), isDay: true },
        power: { solarInW: 0, loadW: 0, balanceWh: 0 },
        device: { battery: { voltage: 3.7, soc: 0.5 } },
        memory: {
          today: {
            temperature: [],
            energyIn: [],
            energyOut: []
          }
        }
      };
    }
  }

  tick() {
    const now = Date.now();
    const dt = (now - this.lastTick) / 1000;
    this.lastTick = now;

    // bezpečné čtení
    const solar = this.state.power.solarInW ?? 0;
    const load = this.state.power.loadW ?? 0;

    const balanceW = solar - load;
    this.state.power.balanceWh += (balanceW * dt) / 3600;

    this.state.time.now = now;

    // simulace dat (živá)
    this.state.power.solarInW = 0.2 + Math.random() * 0.4;
    this.state.power.loadW = 0.15 + Math.random() * 0.05;

    this.state.device.battery.voltage =
      3.6 + this.state.power.balanceWh * 0.1;

    // zápis do paměti
    const t = new Date(now).toLocaleTimeString();

    this.state.memory.today.energyIn.push({ t, v: this.state.power.solarInW });
    this.state.memory.today.energyOut.push({ t, v: this.state.power.loadW });

    // limit velikosti
    if (this.state.memory.today.energyIn.length > 300) {
      this.state.memory.today.energyIn.shift();
      this.state.memory.today.energyOut.shift();
    }
  }

  getState() {
    return this.state;
  }
}
