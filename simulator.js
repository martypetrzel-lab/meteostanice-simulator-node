// simulator.js

import { worldTick } from "./world.js";
import { deviceTick } from "./device.js";
import { memoryTick, initMemory } from "./memory.js";
import { updateBrain } from "./brain.js";

export class Simulator {
  constructor(state) {
    this.state = state;

    // inicializace času
    if (!this.state.time) {
      this.state.time = {
        now: Date.now(),
        isDay: true
      };
    }

    // inicializace světa
    if (!this.state.world) {
      this.state.world = {};
    }

    // inicializace zařízení
    if (!this.state.device) {
      this.state.device = {};
    }

    // inicializace paměti
    initMemory(this.state);

    // první výpočet dne/noci
    this.updateDayState();
  }

  updateDayState() {
    const d = new Date(this.state.time.now);
    const h = d.getHours();
    this.state.time.isDay = h >= 6 && h < 18;
  }

  tick() {
    /* ================== ČAS ================== */
    this.state.time.now = Date.now();
    this.updateDayState();

    /* ================== SVĚT ================== */
    worldTick(this.state);

    /* ================== ZAŘÍZENÍ ================== */
    deviceTick(this.state);

    /* ================== PAMĚŤ ================== */
    memoryTick(this.state);

    /* ================== MOZEK ================== */
    updateBrain(this.state);

    /* ================== HLÁŠKY ================== */
    if (!this.state.message) {
      this.state.message = "Systém běží";
    }
  }
}
