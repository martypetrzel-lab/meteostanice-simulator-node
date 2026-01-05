import { updateWorld } from "./world.js";
import { updateDevice } from "./device.js";
import { updateMemory } from "./memory.js";
import { updateBrain } from "./brain.js";
import fs from "fs";

const STATE_FILE = "./state.json";

export class Simulator {
  constructor() {
    this.state = JSON.parse(fs.readFileSync(STATE_FILE, "utf-8"));
  }

  tick() {
    const now = Date.now();
    this.state.time.now = now;

    updateWorld(this.state);
    updateDevice(this.state);
    updateMemory(this.state);
    updateBrain(this.state);

    fs.writeFileSync(STATE_FILE, JSON.stringify(this.state, null, 2));
  }

  start() {
    console.log("⏱️ Simulator běží: 1s = 1 tick");

    // ⬇️ KLÍČOVÁ ZMĚNA
    setInterval(() => {
      this.tick();
    }, 1000);
  }
}
