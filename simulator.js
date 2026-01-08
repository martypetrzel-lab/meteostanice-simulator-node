// simulator.js
import { worldTick } from "./world.js";
import { deviceTick } from "./device.js";
import { memoryTick } from "./memory.js";
import { decide } from "./brain.js";

export function tick(state, dtMs = 1000) {
  worldTick(state, dtMs);
  deviceTick(state, dtMs);
  memoryTick(state, dtMs);
  decide(state, dtMs);
}
