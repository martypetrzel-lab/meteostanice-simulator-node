import { simulateWorld } from "./world.js";
import { brainDecision } from "./brain.js";

export default class Simulator {
  constructor(state = {}) {
    this.state = state;

    this.state.time ??= { now: Date.now(), lastTick: Date.now(), isDay: true };
    this.state.world ??= {};
    this.state.device ??= {
      temperature: 10,
      light: 0,
      fan: false,
      battery: { voltage: 3.9, soc: 0.6 },
      power: { solarInW: 0, loadW: 0, balanceWh: 0 }
    };

    this.state.memory ??= {
      today: { temperature: [], light: [], energyIn: [], energyOut: [] },
      history: { days: [] }
    };

    this.lastMeasure = { temp: 0, light: 0, energy: 0 };
    this.fanLockUntil = 0;
  }

  tick() {
    const now = Date.now();
    const deltaMs = now - this.state.time.lastTick;
    this.state.time.lastTick = now;
    this.state.time.now = now;

    const h = this.getHourFraction();
    this.state.time.isDay = h >= 6 && h <= 20;

    simulateWorld(this.state, h, deltaMs);
    this.handleEnergy(deltaMs);
    this.measureIfNeeded(now);
    this.runBrain(now);
  }

  runBrain(now) {
    const brain = brainDecision(this.state);

    // hysterese větráku (min. 5 min běhu)
    if (brain.fan && !this.state.device.fan) {
      this.fanLockUntil = now + 5 * 60_000;
      this.state.device.fan = true;
    }

    if (!brain.fan && this.state.device.fan && now > this.fanLockUntil) {
      this.state.device.fan = false;
    }

    this.state.brain = brain;
  }

  handleEnergy(deltaMs) {
    const solar = this.state.time.isDay
      ? this.state.device.light / 100000
      : 0;

    const baseLoad = 0.12;
    const fanLoad = this.state.device.fan ? 1.0 : 0;

    this.state.device.power.solarInW = Number(solar.toFixed(3));
    this.state.device.power.loadW = baseLoad + fanLoad;

    const balanceW = solar - this.state.device.power.loadW;
    this.state.device.power.balanceWh += balanceW * (deltaMs / 3600000);

    this.state.device.battery.soc += balanceW * 0.00005;
    this.state.device.battery.soc = Math.max(0, Math.min(1, this.state.device.battery.soc));
  }

  measureIfNeeded(now) {
    if (now - this.lastMeasure.temp > 5 * 60_000) {
      this.lastMeasure.temp = now;
      this.state.memory.today.temperature.push({
        t: new Date(now).toLocaleTimeString(),
        v: Number(this.state.device.temperature.toFixed(2))
      });
    }

    if (now - this.lastMeasure.light > 5 * 60_000) {
      this.lastMeasure.light = now;
      this.state.memory.today.light.push({
        t: new Date(now).toLocaleTimeString(),
        v: Math.round(this.state.device.light)
      });
    }

    if (now - this.lastMeasure.energy > 5 * 60_000) {
      this.lastMeasure.energy = now;
      this.state.memory.today.energyIn.push({
        t: new Date(now).toLocaleTimeString(),
        v: this.state.device.power.solarInW
      });
      this.state.memory.today.energyOut.push({
        t: new Date(now).toLocaleTimeString(),
        v: this.state.device.power.loadW
      });
    }
  }

  getHourFraction() {
    const d = new Date(this.state.time.now);
    return d.getHours() + d.getMinutes() / 60;
  }

  getState() {
    return this.state;
  }
}
