// sim/world/patterns.js
// T 3.31.0 – Svět & simulace (UZAVŘENO)
// Stresové vzorce jsou meta-modulátory (dlouhé férové "testovací situace").
// Vše je deterministické dle času + seed a vždy plynulé.

export const STRESS_PATTERNS = {
  LONG_GRAY: {
    id: "LONG_GRAY",
    cloudBias: +0.18,
    cloudVarMul: 0.65,
    transMul: 0.78,
    tempBiasC: -0.4
  },

  FALSE_HOPE: {
    id: "FALSE_HOPE",
    cloudBias: +0.10,
    cloudVarMul: 1.35,
    transMul: 0.92,
    tempBiasC: 0.0
  },

  SLOW_DRAIN: {
    id: "SLOW_DRAIN",
    cloudBias: +0.12,
    cloudVarMul: 0.90,
    transMul: 0.85,
    tempBiasC: -0.2
  },

  HOT_LOCK: {
    id: "HOT_LOCK",
    cloudBias: -0.06,
    cloudVarMul: 0.80,
    transMul: 0.95,
    tempBiasC: +2.8
  },

  COLD_NIGHT: {
    id: "COLD_NIGHT",
    cloudBias: 0.0,
    cloudVarMul: 1.00,
    transMul: 1.00,
    tempBiasC: -1.2,
    nightExtraCoolC: 2.0
  },

  BROKEN_RHYTHM: {
    id: "BROKEN_RHYTHM",
    cloudBias: +0.06,
    cloudVarMul: 1.60,
    transMul: 0.88,
    tempBiasC: -0.1
  }
};
