// simulator.js

import { worldTick } from "./world.js";
import { deviceTick } from "./device.js";
import { memoryTick, initMemory } from "./memory.js";
import { updateBrain } from "./brain.js";

export class Simulator {
  constructor(state = {}) {
    this.state = state;

    /* === TIME === */
    this.state.time ??= {
      now: Date.now(),
      isDay: true
    };

    /* === WORLD === */
    this.state.world ??= {};

    /* === DEVICE === */
    this.state.device ??= {};
    this.state.device.power ??= {};
    this.state.device.battery ??= {};

    /* === MEMORY === */
    initMemory(this.state);

    this.updateDayState();
  }

  updateDayState() {
    const h = new Date(this.state.time.now).getHours();
    this.state.time.isDay = h >= 6 && h < 18;
  }

  tick() {
    this.state.time.now = Date.now();
    this.updateDayState();

    worldTick(this.state);
    deviceTick(this.state);
    memoryTick(this.state);
    updateBrain(this.state);

    this.state.message ??= "Systém běží";
  }

  getState() {
    return this.state;
  }
}
