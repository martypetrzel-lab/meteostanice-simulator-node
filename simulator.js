import { worldTick } from "./world.js";
import { deviceTick } from "./device.js";
import { memoryTick } from "./memory.js";
import { decide } from "./brain.js";

export function tick(state) {
  worldTick(state);

  // aby se rozhodnutí projevil hned v tom samém ticku (např. fan -> větší load)
  decide(state);

  deviceTick(state);
  memoryTick(state);
}
