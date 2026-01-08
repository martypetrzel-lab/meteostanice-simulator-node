import { worldTick } from "./world.js";
import { decide } from "./brain.js";
import { deviceTick } from "./device.js";
import { memoryTick } from "./memory.js";

export function tick(state) {
  worldTick(state);

  // rozhodnutí se projeví hned (ovlivní load atd.)
  decide(state);

  deviceTick(state);
  memoryTick(state);
}
