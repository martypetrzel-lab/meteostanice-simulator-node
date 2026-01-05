export default class World {
  constructor(state) {
    this.state = state;
  }

  ensure() {
    this.state.world ??= {};
    this.state.world.environment ??= {};
    this.state.world.time ??= {};
  }

  tick(now) {
    this.ensure();

    const d = new Date(now);
    const hour = d.getHours() + d.getMinutes() / 60;
    const isDay = hour >= 6 && hour <= 20;

    // 🌞 světlo
    let baseLight = 0;
    if (isDay) {
      const x = (hour - 6) / 14;
      baseLight = Math.sin(Math.PI * x) * 100000;
    }

    // 🌥️ mraky
    const clouds = (Math.random() - 0.5) * 8000;

    this.state.world.environment.light = Math.max(0, baseLight + clouds);

    // 🌡️ teplota okolí
    const target = isDay ? 22 : 8;
    const envTemp = this.state.world.environment.temperature ?? target;
    this.state.world.environment.temperature =
      envTemp + (target - envTemp) * 0.002;

    this.state.world.time.now = now;
    this.state.world.time.isDay = isDay;
  }
}
