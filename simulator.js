import { worldTick } from "./world.js";
import { deviceTick } from "./device.js";
import { memoryTick } from "./memory.js";
import { brainTick } from "./brain.js";

const TICK_MS = 1000;               // 1 sekunda
const DAY_LENGTH_MS = 30 * 60 * 1000; // 1 den = 30 minut
const TOTAL_DAYS = 21;

const state = {
  time: {
    now: Date.now(),
    dayIndex: 1,
    isDay: true
  },
  world: {},
  device: {},
  memory: {
    today: {
      temperature: [],
      energyIn: [],
      energyOut: []
    }
  },
  brain: {
    message: "Startuji systém",
    details: []
  }
};

function formatTime(ts) {
  const d = new Date(ts);
  return d.toTimeString().substring(0, 8);
}

function tick() {
  state.time.now += TICK_MS;

  const dayProgress = (state.time.now % DAY_LENGTH_MS) / DAY_LENGTH_MS;
  state.time.isDay = dayProgress > 0.25 && dayProgress < 0.75;
  state.time.dayIndex = Math.min(
    TOTAL_DAYS,
    Math.floor(state.time.now / DAY_LENGTH_MS) + 1
  );

  worldTick(state);
  deviceTick(state);
  memoryTick(state, formatTime(state.time.now));
  brainTick(state);
}

setInterval(tick, TICK_MS);

export const simulator = {
  getState() {
    return state;
  }
};
