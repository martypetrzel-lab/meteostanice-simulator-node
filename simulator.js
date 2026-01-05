export default class Simulator {
  constructor(state = {}) {
    this.state = state;
    this.migrateState();

    this.lastMeasureTemp = 0;
    this.lastMeasureLight = 0;
  }

  /* ================= SAFE MIGRACE ================= */
  migrateState() {
    const now = Date.now();

    // TIME
    this.state.time ??= {};
    this.state.time.now ??= now;
    this.state.time.lastTick ??= now;

    // DEVICE
    this.state.device ??= {};
    this.state.device.temperature ??= 15;
    this.state.device.light ??= 0;
    this.state.device.battery ??= { voltage: 3.84 };
    this.state.device.fan ??= false;

    // MEMORY
    this.state.memory ??= {};
    this.state.memory.today ??= {};
    this.state.memory.history ??= {};
    this.state.memory.history.days ??= [];

    // TODAY ARRAYS – VŽDY EXISTUJÍ
    this.state.memory.today.temperature ??= [];
    this.state.memory.today.light ??= [];
    this.state.memory.today.energyIn ??= [];
    this.state.memory.today.energyOut ??= [];
  }

  /* ================= TICK ================= */
  tick() {
    const now = Date.now();
    this.state.time.now = now;

    const hours = this.getHourFraction();
    this.simulateWorld(hours);
    this.measureIfNeeded(hours, now);
  }

  /* ================= WORLD ================= */
  simulateWorld(hours) {
    // světlo – jednoduchá denní křivka
    if (hours >= 6 && hours <= 20) {
      const x = (hours - 6) / 14;
      this.state.device.light = Math.round(Math.sin(Math.PI * x) * 1000);
    } else {
      this.state.device.light = 0;
    }

    // teplota – pomalý drift
    const target = hours >= 6 && hours <= 20 ? 18 : 10;
    this.state.device.temperature +=
      (target - this.state.device.temperature) * 0.001;
  }

  /* ================= MEASURE ================= */
  measureIfNeeded(hours, now) {
    if (now - this.lastMeasureTemp > 5000) {
      this.lastMeasureTemp = now;
      this.state.memory.today.temperature.push({
        t: new Date(now).toLocaleTimeString(),
        v: Number(this.state.device.temperature.toFixed(2))
      });
    }

    if (now - this.lastMeasureLight > 5000) {
      this.lastMeasureLight = now;
      this.state.memory.today.light.push({
        t: new Date(now).toLocaleTimeString(),
        v: Math.round(this.state.device.light)
      });
    }
  }

  /* ================= HELPERS ================= */
  getHourFraction() {
    const d = new Date(this.state.time.now);
    return d.getHours() + d.getMinutes() / 60;
  }

  getState() {
    return this.state;
  }
}
