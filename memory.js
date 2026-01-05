// memory.js

function todayKey(ts) {
  const d = new Date(ts);
  return d.toISOString().slice(0, 10); // YYYY-MM-DD
}

export function initMemory(state) {
  if (!state.memory) {
    state.memory = {
      today: {
        key: todayKey(state.time.now),
        temperature: [],
        energyIn: [],
        energyOut: []
      },
      days: []
    };
  }
}

export function memoryTick(state) {
  initMemory(state);

  const nowKey = todayKey(state.time.now);

  /* ================== NOVÝ DEN ================== */
  if (state.memory.today.key !== nowKey) {
    const t = state.memory.today.temperature;
    const ei = state.memory.today.energyIn;
    const eo = state.memory.today.energyOut;

    if (t.length) {
      const temps = t.map(x => x.v);
      const lights = state.memory.today.energyIn.map(x => x.v);

      state.memory.days.push({
        date: state.memory.today.key,
        minTemp: Math.min(...temps),
        maxTemp: Math.max(...temps),
        minEnergyIn: Math.min(...ei.map(x => x.v)),
        maxEnergyIn: Math.max(...ei.map(x => x.v)),
        energyIn: Number(ei.reduce((a, b) => a + b.v, 0).toFixed(2)),
        energyOut: Number(eo.reduce((a, b) => a + b.v, 0).toFixed(2))
      });

      // držíme jen posledních 7 dní
      if (state.memory.days.length > 7) {
        state.memory.days.shift();
      }
    }

    // reset dne
    state.memory.today = {
      key: nowKey,
      temperature: [],
      energyIn: [],
      energyOut: []
    };
  }

  /* ================== VZORKOVÁNÍ ================== */
  // ukládáme jen jednou za minutu
  if (!state.memory._lastSample) {
    state.memory._lastSample = 0;
  }

  if (state.time.now - state.memory._lastSample >= 60_000) {
    state.memory._lastSample = state.time.now;

    const label = new Date(state.time.now).toLocaleTimeString();

    state.memory.today.temperature.push({
      t: label,
      v: state.device.temperature
    });

    state.memory.today.energyIn.push({
      t: label,
      v: state.device.power.solarInW
    });

    state.memory.today.energyOut.push({
      t: label,
      v: state.device.power.loadW
    });

    // ochrana proti nekonečnému růstu (1 den ~ 1440 bodů)
    if (state.memory.today.temperature.length > 1500) {
      state.memory.today.temperature.shift();
      state.memory.today.energyIn.shift();
      state.memory.today.energyOut.shift();
    }
  }
}
