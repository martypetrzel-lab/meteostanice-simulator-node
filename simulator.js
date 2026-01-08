import { decide } from "./brain.js";
import { worldTick } from "./world.js";
import { deviceTick } from "./device.js";
import { memoryTick } from "./memory.js";

export class Simulator {
  constructor() {
    this.state = {
      time: {
        now: Date.now()
      },
      world: {
        temperature: 15,
        light: 300
      },
      device: {
        temperature: 15,
        fan: false,
        battery: {
          voltage: 3.85,
          soc: 0.6
        },
        power: {
          solarInW: 0,
          loadW: 0
        }
      },
      brain: {
        verdict: "Inicializace"
      },
      memory: {}
    };
  }

  tick() {
    this.state.time.now = Date.now();

    worldTick(this.state);
    decide(this.state);
    deviceTick(this.state);
    memoryTick(this.state);
  }
}
