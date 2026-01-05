// memorySchema.js

export function createMemoryRoot() {
  return {
    today: {
      temperature: [],
      light: [],
      energyIn: [],
      energyOut: [],
      decisions: [],
      penalties: []
    },
    history: {
      days: []
    }
  };
}

export function createDaySummary(date, memory) {
  const avg = arr =>
    arr.length ? arr.reduce((a, b) => a + b.v, 0) / arr.length : 0;

  return {
    date,
    avgTemp: avg(memory.today.temperature),
    avgLight: avg(memory.today.light),
    energyIn: avg(memory.today.energyIn),
    energyOut: avg(memory.today.energyOut),
    penalty: memory.today.penalties.reduce((a, b) => a + b, 0),
    decisions: memory.today.decisions.length
  };
}
