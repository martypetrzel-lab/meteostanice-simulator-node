// world.js
export default class World {
  simulate(now) {
    const d = new Date(now);
    const hour = d.getHours() + d.getMinutes() / 60;

    const isDay = hour >= 6 && hour <= 20;

    let light = 0;
    if (isDay) {
      const x = (hour - 6) / 14;
      light = Math.sin(Math.PI * x) * 1000;
      light += (Math.random() - 0.5) * 50; // jemný šum
    }

    return {
      isDay,
      light: Math.max(0, Math.round(light))
    };
  }
}
