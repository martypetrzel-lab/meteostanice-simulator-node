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

export function createMemoryRoot() {
  return {
    today: createTodayMemory(),
    days: [],
    history: {
      days: []
    }
  };
}
