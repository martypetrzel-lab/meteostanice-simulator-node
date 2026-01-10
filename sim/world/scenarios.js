// sim/world/scenarios.js
// T 3.31.0 – Svět & simulace (UZAVŘENO)
// Scénáře definují dlouhodobý charakter počasí (typicky 8–24 h segmenty).
// Pozn.: svět nikdy nečte baterii ani rozhodnutí mozku.

export const SCENARIOS = {
  STABLE_CLEAR: {
    id: "STABLE_CLEAR",
    cloudMean: 0.10,
    cloudVar: 0.08,
    tempOffsetC: +1.5,
    transmittance: 0.92
  },

  VARIABLE_CLOUDS: {
    id: "VARIABLE_CLOUDS",
    cloudMean: 0.45,
    cloudVar: 0.30,
    tempOffsetC: 0.0,
    transmittance: 0.72
  },

  OVERCAST_BAD: {
    id: "OVERCAST_BAD",
    cloudMean: 0.88,
    cloudVar: 0.10,
    tempOffsetC: -1.0,
    transmittance: 0.38
  },

  HEAT_WAVE: {
    id: "HEAT_WAVE",
    cloudMean: 0.18,
    cloudVar: 0.12,
    tempOffsetC: +6.0,
    transmittance: 0.90
  },

  COLD_CLEAR: {
    id: "COLD_CLEAR",
    cloudMean: 0.12,
    cloudVar: 0.10,
    tempOffsetC: -6.0,
    transmittance: 0.90
  },

  UNSTABLE_FRONT: {
    id: "UNSTABLE_FRONT",
    cloudMean: 0.60,
    cloudVar: 0.35,
    tempOffsetC: -0.5,
    transmittance: 0.62
  }
};
