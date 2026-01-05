// simulator.js
import { decide } from "./brain.js";
import { createMemoryRoot, createDaySummary } from "./memorySchema.js";
import { createWorld } from "./world.js";

export class Simulator {
  constructor() {
    this.world = createWorld();
    this.state = {
      time: {
        now: Date.now(),
        lastDay: new Date().toDateString()
      },
      device: {
        temperature: 15,
        humidity: 50,
        light: 0,
        fan: false,
        battery: {
          voltage: 3.8,
          soc: 0.6
        },
        power: {
          solarInW: 0,
          loadW: 0,
          balanceWh: 0
        }
      },
      memory: createMemoryRoot(),
      message: ""
    };
  }

  tick() {
    this.world.tick();
    this.state.time.now = Date.now();

    this.simulateSensors();
    this.storeToday();
    this.checkDayChange();
    this.think();
  }

  simulateSensors() {
    const env = this.world.environment;
    const dev = this.state.device;

    dev.temperature = env.temperature;
    dev.light = env.light;

    dev.power.solarInW = env.light > 300 ? env.light / 2000 : 0;
    dev.power.loadW = dev.fan ? 1.0 : 0.2;

    dev.power.balanceWh =
      (dev.power.solarInW - dev.power.loadW) / 3600;

    dev.battery.soc = Math.min(
      1,
      Math.max(0, dev.battery.soc + dev.power.balanceWh)
    );
  }

  storeToday() {
    const t = new Date(this.state.time.now).toLocaleTimeString();
    const m = this.state.memory.today;

    m.temperature.push({ t, v: this.state.device.temperature });
    m.light.push({ t, v: this.state.device.light });
    m.energyIn.push({ t, v: this.state.device.power.solarInW });
    m.energyOut.push({ t, v: this.state.device.power.loadW });
  }

  checkDayChange() {
    const today = new Date().toDateString();
    if (today !== this.state.time.lastDay) {
      this.finalizeDay();
      this.state.time.lastDay = today;
    }
  }

  finalizeDay() {
    const m = this.state.memory.today;

    const summary = createDaySummary(this.state.time.lastDay);

    const avg = arr =>
      arr.reduce((s, x) => s + x.v, 0) / arr.length;

    summary.temperature.min = Math.min(...m.temperature.map(x => x.v));
    summary.temperature.max = Math.max(...m.temperature.map(x => x.v));
    summary.temperature.avg = avg(m.temperature);

    summary.light.min = Math.min(...m.light.map(x => x.v));
    summary.light.max = Math.max(...m.light.map(x => x.v));
    summary.light.avg = avg(m.light);

    summary.energy.in = m.energyIn.reduce((s, x) => s + x.v, 0);
    summary.energy.out = m.energyOut.reduce((s, x) => s + x.v, 0);
    summary.energy.balance = summary.energy.in - summary.energy.out;

    this.state.memory.days.push(summary);
    if (this.state.memory.days.length > 7) {
      this.state.memory.history.push(this.state.memory.days.shift());
    }

    this.state.memory.today = {
      temperature: [],
      humidity: [],
      light: [],
      energyIn: [],
      energyOut: []
    };
  }

  think() {
    const decisions = decide(this.state, this.state.memory);
    decisions.forEach(d => {
      if (d.type === "fan") this.state.device.fan = d.value;
    });

    this.state.message = decisions
      .map(d => `${d.type}: ${d.reason}`)
      .join(" | ");
  }

  getState() {
    return this.state;
  }
}
