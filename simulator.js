// simulator.js
import { decide } from "./brain.js";
import { createMemoryRoot } from "./memorySchema.js";

export class Simulator {
  constructor() {
    this.state = {
      time: {
        now: Date.now(),
        lastTick: Date.now(),
        isDay: true
      },
      world: {
        environment: {
          temperature: 15,
          light: 400
        }
      },
      device: {
        temperature: 15,
        humidity: 50,
        light: 800,
        battery: {
          voltage: 3.8,
          soc: 0.6
        },
        power: {
          solarInW: 0.3,
          loadW: 0.18,
          balanceWh: 0
        },
        fan: false
      },
      memory: createMemoryRoot(),
      message: "",
      details: []
    };
  }

  tick() {
    this.state.time.now = Date.now();
    this.measure();
    this.think();
  }

  measure() {
    const now = new Date();

    // simulace světa
    this.state.device.light =
      this.state.world.environment.light +
      Math.random() * 50 - 25;

    this.state.device.temperature +=
      (this.state.device.fan ? -0.05 : 0.02);

    // ENERGIE
    this.state.device.power.solarInW =
      this.state.world.environment.light > 300
        ? 0.3 + Math.random() * 0.2
        : 0.05;

    this.state.device.power.loadW =
      this.state.device.fan ? 0.18 + 1.0 : 0.18;

    const balance =
      this.state.device.power.solarInW -
      this.state.device.power.loadW;

    this.state.device.power.balanceWh = balance / 3600;
    this.state.device.battery.soc = Math.max(
      0,
      Math.min(1, this.state.device.battery.soc + balance * 0.001)
    );

    // ✅ SAFE zápis – struktura JE GARANTOVANÁ
    this.state.memory.today.light.push({
      t: now.toLocaleTimeString(),
      v: Math.round(this.state.device.light)
    });

    this.state.memory.today.temperature.push({
      t: now.toLocaleTimeString(),
      v: Number(this.state.device.temperature.toFixed(2))
    });

    this.state.memory.today.energyIn.push({
      t: now.toLocaleTimeString(),
      v: Number(this.state.device.power.solarInW.toFixed(2))
    });

    this.state.memory.today.energyOut.push({
      t: now.toLocaleTimeString(),
      v: Number(this.state.device.power.loadW.toFixed(2))
    });
  }

  think() {
    const decision = decide(this.state);

    this.state.device.fan = decision.fan;
    this.state.message = decision.reason.join(" | ");
    this.state.details = [
      `SOC: ${(this.state.device.battery.soc * 100).toFixed(0)} %`,
      `Fan: ${this.state.device.fan ? "ON" : "OFF"}`
    ];
  }

  getState() {
    return this.state;
  }
}
