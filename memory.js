// memory.js

const TZ = "Europe/Prague";

function todayKeyPrague(ts) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(new Date(ts));

  const map = {};
  for (const p of parts) {
    if (p.type !== "literal") map[p.type] = p.value;
  }

  // en-CA je bezpečný na YYYY-MM-DD
  return `${map.year}-${map.month}-${map.day}`;
}

export function initMemory(state) {
  if (!state.memory) state.memory = {};

  if (!state.memory.today) {
    state.memory.today = {
      key: todayKeyPrague(state.time.now),
      temperature: [],
      energyIn: [],
      energyOut: []
    };
  }

  if (!state.memory.days) state.memory.days = [];
  if (!state.memory.experiences) state.memory.experiences = {};
  if (!state.meta) state.meta = {};
}

export function memoryTick(state) {
  initMemory(state);

  const nowKey = todayKeyPrague(state.time.now);

  if (state.memory.today.key !== nowKey) {
    state.memory.days.push({
      key: state.memory.today.key,
      temperature: state.memory.today.temperature,
      energyIn: state.memory.today.energyIn,
      energyOut: state.memory.today.energyOut
    });

    state.memory.today = {
      key: nowKey,
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

  state.meta.lastExperience = type;
  state.meta.learned = true;
}
