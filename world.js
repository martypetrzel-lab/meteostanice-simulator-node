// world.js
export function createWorld() {
  return {
    environment: {
      temperature: 15,
      light: 500,
      rain: false
    },
    tick() {
      // Denní cyklus světla
      const hour = new Date().getHours();
      this.environment.light =
        hour >= 6 && hour <= 18
          ? 400 + Math.random() * 600
          : 20 + Math.random() * 30;

      // Teplota pomalu kolísá
      this.environment.temperature += (Math.random() - 0.5) * 0.2;
    }
  };
}
