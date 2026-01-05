import { computeLight } from "./world.js";
import { decide } from "./brain.js";

export class Simulator {
  constructor() {
    this.state = {
      time: Date.now(),
      device: {
        temperature: 15,
        fan: false
      },
      environment: {
        light: 0
      },
      power: {
        soc: 0.6,
        production: 0,
        load: 0
      },
      brain: {
        verdict: "Inicializace"
      }
    };
  }

  tick(dt = 1) {
    this.state.time += dt * 1000;

    // 🌞 světlo
    const targetLight = computeLight(this.state.time);
    this.state.environment.light += (targetLight - this.state.environment.light) * 0.05;

    // 🔋 výroba (panel)
    this.state.power.production = this.state.environment.light * 0.004;

    // 🌀 zátěž
    this.state.power.load = this.state.device.fan ? 1.2 : 0.15;

    // 🔋 SOC integrace
    const delta = (this.state.power.production - this.state.power.load) / 3600;
    this.state.power.soc = Math.min(1, Math.max(0, this.state.power.soc + delta));

    // 🌡️ teplota – setrvačnost
    const ambient = 10 + this.state.environment.light * 0.01;
    this.state.device.temperature += (ambient - this.state.device.temperature) * 0.002;

    // 🧠 rozhodnutí
    this.state.brain.verdict = decide(this.state);
  }

  getState() {
    return this.state;
  }
}
