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
    this.lastSample = 0;
  }

  loadState() {
    let s;
    try {
      s = JSON.parse(fs.readFileSync(this.file, "utf-8"));
    } catch {
      s = {};
    }

    /* 🔒 DEFENSIVNÍ INICIALIZACE */
    s.time ??= {};
    s.time.now ??= Date.now();
    s.time.minuteOfDay ??= 0;
    s.time.isDay ??= true;

    s.world ??= {};
    s.world.temperature ??= 10;
    s.world.light ??= 0;
    s.world.cloudiness ??= 0;
    s.world.event ??= null;

    s.device ??= {};
    s.device.temperature ??= 10;
    s.device.light ??= 0;
    s.device.mode ??= "normal";
    s.device.sampleInterval ??= 15;

    s.device.battery ??= {};
    s.device.battery.soc ??= 0.6;
    s.device.battery.voltage ??= 3.8;

    s.device.power ??= {};
    s.device.power.solarInW ??= 0;
    s.device.power.loadW ??= 0.18;
    s.device.power.balanceWh ??= 0;

    s.memory ??= {};
    s.memory.today ??= { temperature: [], energyIn: [], energyOut: [] };

    s.memory.stats ??= {
      avgLight: 0,
      avgBalance: 0,
      trendLight: 0
    };

    s.message ??= "";
    s.details ??= [];

    return s;
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

    const brain = updateBrain(this.state);
    this.state.message = brain.message;
    this.state.details = brain.details;

    if (now - this.lastSample > this.state.device.sampleInterval * 1000) {
      memoryTick(this.state, d.toLocaleTimeString());
      this.lastSample = now;
    }

    if (now - this.lastSave > 20000) {
      this.saveState();
      this.lastSave = now;
    }
  }

  getState() {
    return this.state;
  }
}
