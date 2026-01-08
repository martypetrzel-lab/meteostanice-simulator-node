import { createMemoryRoot } from "./memorySchema.js";

function todayKey(ts) {
  return new Date(ts).toISOString().slice(0, 10);
}

export function initMemory(state) {
  if (!state.memory) {
    state.memory = createMemoryRoot();
  }
}

export function rememberExperience(state, type) {
  initMemory(state);

  if (!state.memory.experiences[type]) {
    state.memory.experiences[type] = 0;
  }

  state.memory.experiences[type]++;

  state.memory.lastExperience = {
    type,
    time: state.time.now
  };
}

export function memoryTick(state) {
  initMemory(state);

  const key = todayKey(state.time.now);

  if (state.memory.today.key !== key) {
    if (state.memory.today.key) {
      state.memory.days.push(state.memory.today);
    }

    state.memory.today = {
      key,
      temperature: [],
      energyIn: [],
      energyOut: []
    };
  }

  state.memory.today.temperature.push({
    t: state.time.now,
    v: state.environment.temperature
  });
}
