// memorySchema.js
export function createTodayMemory() {
  return {
    temperature: [],
    humidity: [],
    light: [],
    energyIn: [],
    energyOut: []
  };
}

export function createDaySummary(date) {
  return {
    date,
    temperature: { min: null, max: null, avg: null },
    light: { min: null, max: null, avg: null },
    energy: { in: 0, out: 0, balance: 0 }
  };
}

export function createMemoryRoot() {
  return {
    today: createTodayMemory(),
    days: [],       // posledních 7 dní (shrnutí)
    history: []     // archiv (neomezený)
  };
}
