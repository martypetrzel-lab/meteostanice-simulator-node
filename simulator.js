import { worldTick } from "./world.js";
import { deviceTick } from "./device.js";
import { decide } from "./brain.js";
import { memoryTick } from "./memory.js";

export function initState(state) {
  if (!state.environment) {
    state.environment = {
      temperature: 15,
      light: 0
    };
  }

  if (!state.energy) {
    state.energy = {
      soc: 80,
      in: 0,
      out: 0
    };
  }

  if (!state.device) {
    state.device = {
      temperature: 25,
      fan: false
    };
  }

  if (!state.brain) {
    state.brain = {
      lastVerdict: "INIT",
      message: "Probouzím se…"
    };
  }

  if (!state.time) {
    state.time = {
      now: Date.now()
    };
  }
}

export function tick(state) {
  initState(state);

  worldTick(state);
  deviceTick(state);
  decide(state);
  memoryTick(state);
}
