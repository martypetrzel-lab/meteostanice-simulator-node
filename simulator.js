// simulator.js
import { worldTick } from "./world.js";
import { deviceTick } from "./device.js";
import { energyTick } from "./energy.js";
import { luxSunsetTick } from "./luxSunset.js";
import { memoryTick } from "./memory.js";
import { decide } from "./brain.js";

export function tick(state, dtMs = 1000) {
  worldTick(state, dtMs);
  luxSunsetTick(state, dtMs); // B 3.34.0: lux→dayFlag→learned sunset
  deviceTick(state, dtMs);
  energyTick(state, dtMs);
  memoryTick(state, dtMs);
  decide(state); // mozek beze změn, ale dostane přesnější env.sun.sunsetTs
}
