export function createEmptyMemory() {
  return {
    today: {
      temperature: [],
      humidity: [],
      light: [],
      energyIn: [],
      energyOut: []
    },
    history: {
      days: []
    }
  };
}
