export function createMemoryRoot() {
  return {
    today: {
      key: null,
      temperature: [],
      energyIn: [],
      energyOut: []
    },
    days: [],
    experiences: {}
  };
}
