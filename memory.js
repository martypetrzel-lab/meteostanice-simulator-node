function todayKey(ts) {
  return new Date(ts).toISOString().slice(0, 10);
}

export function initMemory(state) {
  if (!state.memory) state.memory = {};

  if (!state.memory.today) {
    state.memory.today = {
      key: todayKey(state.time.now),
      temperature: [],
      energyIn: [],
      energyOut: []
    };
  }

  if (!state.memory.days) state.memory.days = [];
  if (!state.memory.experiences) state.memory.experiences = {};
}

export function memoryTick(state) {
  initMemory(state);

  const key = todayKey(state.time.now);
  if (state.memory.today.key !== key) {
    state.memory.days.push(JSON.parse(JSON.stringify(state.memory.today)));
    state.memory.today = {
      key,
      temperature: [],
      energyIn: [],
      energyOut: []
    };
  }
}

export function rememberExperience(state, type, data = {}) {
  initMemory(state);
  if (!state.memory.experiences[type]) {
    state.memory.experiences[type] = [];
  }

  state.memory.experiences[type].push({
    time: state.time.now,
    ...data
  });
}
