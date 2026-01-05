// simulator.js
import state from "./state.json" assert { type: "json" };

export class Simulator {
  constructor() {
    this.state = state;
  }

  tick() {
    // POSUN ČASU (1s = 1s)
    this.state.time.now += 1000;

    // jednoduchá simulace
    const t = this.state.time.now / 1000;

    // teplota lehce osciluje
    const baseTemp = 15;
    this.state.device.temperature =
      baseTemp + Math.sin(t / 60) * 0.2;

    // světlo podle dne
    this.state.device.light = this.state.time.isDay
      ? 300 + Math.random() * 200
      : 5;

    // energie
    this.state.device.power.solarInW =
      this.state.device.light / 1000;

    this.state.message = "Podmínky stabilní, sbírám data";
  }

  getState() {
    return this.state;
  }
}
