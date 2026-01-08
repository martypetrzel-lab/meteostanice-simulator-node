export function createMemoryRoot() {
  return {
    today: {
      key: null,
      temperature: [],
      energyIn: [],
      energyOut: [],
      totals: {
        energyInWh: 0,
        energyOutWh: 0
      },
      stats: {
        minT: null,
        maxT: null,
        avgT: null
      }
    },
    days: [],
    weeks: [],
    experiences: {},
    experienceCounters: {}
  };
}
