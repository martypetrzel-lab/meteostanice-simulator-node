// memorySchema.js

export function createDayBucket() {
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
    today: createDayBucket(),
    history: {
      days: [] // hotové dny (summary)
    }
  };
}

export function createDaySummary(day, memory) {
  const summary = {};

  for (const key of Object.keys(memory.today)) {
    const values = memory.today[key].map(e => e.v).filter(v => v !== null);
    summary[key] = {
      min: values.length ? Math.min(...values) : null,
      max: values.length ? Math.max(...values) : null
    };
  }

  summary.day = day;
  return summary;
}
