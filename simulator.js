import { worldTick } from "./world.js";
import { deviceTick } from "./device.js";
import { decide } from "./brain.js";
import { memoryTick } from "./memory.js";

export function tick(state) {
  worldTick(state);
  deviceTick(state);
  decide(state);
  memoryTick(state);
}
