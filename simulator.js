import { deviceTick } from "./device.js";
import { worldTick } from "./world.js";

export class Simulator {
  constructor(initialState = {}) {
    // ✅ VŽDY existuje state
    this.state = initialState;

    /* ===== TIME ===== */
    if (!this.state.time) {
      this.state.time = {
        now: Date.now()
      };
    }

    /* ===== WORLD ===== */
    if (!this.state.world) {
      this.state.world = {
        light: 0,
        temperature: 10
      };
    }

    /* ===== DEVICE ===== */
    if (!this.state.device) {
      this.state.device = {
        temperature: 10,
        light: 0,
        fan: false,
        mode: "Init",
        power: {
          solarInW: 0,
          loadW: 0,
          balanceWh: 0
        },
        battery: {
          voltage: 3.7
        }
      };
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
