function todayKey(ts) {
  return new Date(ts).toISOString().slice(0, 10);
}

function hhmmss(ts) {
  return new Date(ts).toISOString().slice(11, 19);
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

  if (!state.meta) state.meta = {};
  if (!state.meta.lastSampleAt) state.meta.lastSampleAt = 0;
}

export function memoryTick(state) {
  initMemory(state);

  const nowKey = todayKey(state.time.now);

  // přechod dne
  if (state.memory.today.key !== nowKey) {
    state.memory.days.push(JSON.parse(JSON.stringify(state.memory.today)));

    // drž historii rozumně (např. 21 dní)
    if (state.memory.days.length > 21) {
      state.memory.days = state.memory.days.slice(-21);
    }

    state.memory.today = { key: nowKey, temperature: [], energyIn: [], energyOut: [] };
  }

  // sampling 1× za 60s (můžeš později upravit podle “energie”)
  const sampleEveryMs = 60_000;
  if (state.time.now - state.meta.lastSampleAt < sampleEveryMs) return;

  const t = state.device?.temperature ?? state.world?.environment?.temperature ?? null;
  const solarInW = state.device?.power?.solarInW ?? null;
  const loadW = state.device?.power?.loadW ?? null;

  const stamp = hhmmss(state.time.now);

  if (t !== null) state.memory.today.temperature.push({ t: stamp, v: Number(t.toFixed(2)) });
  if (solarInW !== null) state.memory.today.energyIn.push({ t: stamp, v: Number(solarInW.toFixed(3)) });
  if (loadW !== null) state.memory.today.energyOut.push({ t: stamp, v: Number(loadW.toFixed(3)) });

  // udržuj dnešní graf rozumně veliký (např. max 1440 bodů = minuta celý den)
  const cap = 1440;
  if (state.memory.today.temperature.length > cap) state.memory.today.temperature = state.memory.today.temperature.slice(-cap);
  if (state.memory.today.energyIn.length > cap) state.memory.today.energyIn = state.memory.today.energyIn.slice(-cap);
  if (state.memory.today.energyOut.length > cap) state.memory.today.energyOut = state.memory.today.energyOut.slice(-cap);

  state.meta.lastSampleAt = state.time.now;
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

  // drž zkušenosti rozumně (aby to nenarostlo do nekonečna)
  if (state.memory.experiences[type].length > 200) {
    state.memory.experiences[type] = state.memory.experiences[type].slice(-200);
  }

  state.meta.lastExperience = type;
  state.meta.learned = true;
}
