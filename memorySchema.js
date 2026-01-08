export function createMemoryRoot() {
  return {
    today: {
      key: null,
      temperature: [],
      energyIn: [],
      energyOut: [],
    },
    days: [],
    experiences: {
      overheating: 0,
      lowEnergy: 0,
      riskyDecision: 0
    }
  };
}
