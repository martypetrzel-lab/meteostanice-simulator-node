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
      message: "Inicializace",
      details: []
    };
  }

  tick() {
    this.state.time.now = Date.now();

    this.handleDayChange();
    this.simulateEnvironment();
    this.measure();
    this.think();
  }

  handleDayChange() {
    const today = new Date().toDateString();

    if (today !== this.state.time.lastDay) {
      const summary = createDaySummary(
        this.state.time.lastDay,
        this.state.memory
      );

      this.state.memory.history.days.push(summary);
      this.state.memory.today = createMemoryRoot().today;
      this.state.time.lastDay = today;
    }
  }

  simulateEnvironment() {
    const env = this.world.environment;

    this.state.device.temperature += (env.temperature - this.state.device.temperature) * 0.05;
    this.state.device.light = env.light;
  }

  safePush(bucket, value) {
    if (!Array.isArray(bucket)) return;
    bucket.push({
      t: new Date().toLocaleTimeString(),
      v: value
    });
  }

  measure() {
    const mem = this.state.memory.today;

    // ⛑️ DEFENZIVA – kdyby cokoli chybělo
    if (!mem.temperature) return;

    this.safePush(mem.temperature, this.state.device.temperature);
    this.safePush(mem.humidity, this.state.device.humidity);
    this.safePush(mem.light, this.state.device.light);
    this.safePush(mem.energyIn, this.state.device.power.solarInW);
    this.safePush(mem.energyOut, this.state.device.power.loadW);
  }

  think() {
    const decision = decide(this.state);

    this.state.device.fan = decision.fan;
    this.state.message = decision.message;
    this.state.details = decision.details;
  }
}
