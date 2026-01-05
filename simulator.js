import fs from "fs";
import { worldTick } from "./world.js";
import { deviceTick } from "./device.js";
import { updateBrain } from "./brain.js";
import { memoryTick } from "./memory.js";

export class Simulator {
  constructor() {
    this.file = "./state.json";
    this.state = this.loadState();
    this.lastSave = Date.now();
  }

  loadState() {
    try {
      return JSON.parse(fs.readFileSync(this.file, "utf-8"));
    } catch {
      return {
        time: { now: Date.now(), isDay: true, minuteOfDay: 0 },
        world: {
          temperature: 10,
          light: 0,
          cloudiness: 0,
          event: null
        },
        device: {
          temperature: 10,
          humidity: 60,
          light: 0,
          battery: { voltage: 3.8, soc: 0.6 },
          power: { solarInW: 0, loadW: 0.18, balanceWh: 0 },
          mode: "normal"
        },
        memory: {
          today: { temperature: [], energyIn: [], energyOut: [] },
          stats: { avgLight: 0, avgBalance: 0 }
        },
        message: "",
        details: []
      };
    }
  }

  saveState() {
    fs.writeFileSync(this.file, JSON.stringify(this.state, null, 2));
  }

  tick() {
    const now = Date.now();
    const d = new Date(now);

    this.state.time.now = now;
    this.state.time.minuteOfDay = d.getHours() * 60 + d.getMinutes();
    this.state.time.isDay = d.getHours() >= 6 && d.getHours() <= 19;

    worldTick(this.state);
    deviceTick(this.state);

    const label = d.toLocaleTimeString();
    memoryTick(this.state, label);

    const brain = updateBrain(this.state);
    this.state.message = brain.message;
    this.state.details = brain.details;

    if (Date.now() - this.lastSave > 15000) {
      this.saveState();
      this.lastSave = Date.now();
    }
  }

  getState() {
    return this.state;
  }
}
