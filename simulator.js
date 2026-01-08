import { worldTick } from "./world.js";
import { deviceTick } from "./device.js";
import { memoryTick } from "./memory.js";
import { decide } from "./brain.js";

export function tick(state) {
  worldTick(state);
  deviceTick(state);
  memoryTick(state);
  decide(state);
}
