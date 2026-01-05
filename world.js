export function createWorld() {
  return {
    latitude: 50.1,
    dayLength: 24 * 60 * 60 * 1000
  };
}

export function computeLight(now) {
  const dayMs = 24 * 60 * 60 * 1000;
  const t = (now % dayMs) / dayMs;

  // sinus den/noc (0–1)
  const sun = Math.max(0, Math.sin(Math.PI * (t - 0.25)));

  // max cca 900 lx
  return sun * 900;
}
