import fs from "fs";
import { worldTick } from "./world.js";
import { deviceTick } from "./device.js";
import { updateBrain } from "./brain.js";
import { memoryTick } from "./memory.js";

export class Simulator {
  constructor() {
    this.state = this.loadState();
    this.lastTick = Date.now();
  }

  loadState() {
    try {
      return JSON.parse(fs.readFileSync("./state.json", "utf-8"));
    } catch {
      return {
        time: {
          now: Date.now(),
          isDay: true,
          dayIndex: 0
        },
        world: {},
        device: {
          temperature: 15,
          humidity: 50,
          light: 300,
          battery: {
            voltage: 3.8,
            soc: 0.6
          },
          power: {
            solarInW: 0,
            loadW: 0.18,
            balanceWh: 0
          },
          fan: false
        },
        memory: {
          today: {
            temperature: [],
            energyIn: [],
            energyOut: []
          },
          days: []
        },
        message: "",
        details: []
      };
    }
  }

  tick() {
    const now = Date.now();
    this.state.time.now = now;
    this.state.time.isDay = new Date(now).getHours() >= 7 && new Date(now).getHours() <= 18;

    worldTick(this.state);
    deviceTick(this.state);

    const label = new Date(now).toLocaleTimeString();
    memoryTick(this.state, label);

    const brain = updateBrain(this.state);
    this.state.message = brain.message;
    this.state.details = brain.details;
  }

  getState() {
    return this.state;
  }
}
