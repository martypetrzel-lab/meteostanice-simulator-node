import { Brain } from "./brain.js";
import { createEmptyMemory } from "./memorySchema.js";

export class Simulator {
  constructor() {
    this.brain = new Brain();
    this.memory = createEmptyMemory();

    this.state = {
      time: {
        now: Date.now()
      },
      world: {
        environment: {
          temperature: 15,
          light: 500
        }
      },
      device: {
        temperature: 25,
        humidity: 50,
        battery: {
          voltage: 3.9,
          soc: 0.6
        },
        power: {
          solarInW: 0.5,
          loadW: 0.2,
          balanceWh: 0
        },
        fan: false
      },
      brain: {}
    };
  }

  tick() {
    this.simulateWorld();
    this.measure();
    this.think();
    this.consumeEnergy();
  }

  simulateWorld() {
    const hour = new Date().getHours();
    const isDay = hour >= 7 && hour <= 18;

    this.state.world.environment.light = isDay
      ? 800 + Math.random() * 200
      : 50 + Math.random() * 50;
  }

  measure() {
    const t = new Date().toLocaleTimeString();

    this.memory.today.light.push({
      t,
      v: this.state.world.environment.light
    });

    this.memory.today.temperature.push({
      t,
      v: this.state.device.temperature
    });
  }

  think() {
    const decision = this.brain.decide(this.state);

    this.state.device.fan = decision.fan;
    this.state.brain = decision.explanation;
  }

  consumeEnergy() {
    const FAN_W = this.state.device.fan ? 1.0 : 0;
    const BASE_W = 0.2;

    this.state.device.power.loadW = BASE_W + FAN_W;

    const delta =
      (this.state.device.power.solarInW -
        this.state.device.power.loadW) /
      3600;

    this.state.device.battery.soc = Math.min(
      1,
      Math.max(0, this.state.device.battery.soc + delta)
    );
  }

  getState() {
    return {
      ...this.state,
      memory: this.memory
    };
  }
}
