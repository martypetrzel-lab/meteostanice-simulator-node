import { deviceTick } from "./device.js";
import { worldTick } from "./world.js";

export class Simulator {
  constructor(state) {
    this.state = state;

    if (!this.state.time) {
      this.state.time = { now: Date.now() };
    }
  }

  tick() {
    this.state.time.now = Date.now();

    worldTick(this.state);
    deviceTick(this.state);
  }

  getState() {
    return this.state;
  }
}
