// simulator.js

import { worldTick } from "./world.js";
import { deviceTick } from "./device.js";
import { memoryTick, initMemory } from "./memory.js";
import { updateBrain } from "./brain.js";

export class Simulator {
  constructor(state = {}) {
    /* ================== STATE ================== */
    this.state = state;

    /* ================== TIME ================== */
    if (!this.state.time) {
      this.state.time = {
        now: Date.now(),
        isDay: true
      };
    }

    /* ================== WORLD ================== */
    if (!this.state.world) {
      this.state.world = {};
    }

    /* ================== DEVICE ================== */
    if (!this.state.device) {
      this.state.device = {};
    }

    /* ================== MEMORY ================== */
    initMemory(this.state);

    /* ================== INIT DAY/NIGHT ================== */
    this.updateDayState();
  }

  updateDayState() {
    const d = new Date(this.state.time.now);
    const h = d.getHours();
    this.state.time.isDay = h >= 6 && h < 18;
  }

  tick() {
    /* ================== TIME ================== */
    this.state.time.now = Date.now();
    this.updateDayState();

    /* ================== WORLD ================== */
    worldTick(this.state);

    /* ================== DEVICE ================== */
    deviceTick(this.state);

    /* ================== MEMORY ================== */
    memoryTick(this.state);

    /* ================== BRAIN ================== */
    updateBrain(this.state);

    /* ================== MESSAGE FALLBACK ================== */
    if (!this.state.message) {
      this.state.message = "Systém běží";
    }
  }
}
