// simulator.js
// ZÁLOHA 0.2.1 – SAFE STATE + REÁLNÝ DEN
console.log("🧠 SIMULATOR VERSION: ZALOHA 0.2.1 – SAFE STATE");

export default class Simulator {
  constructor(state = {}) {
    // ===== TIME =====
    this.state = state;

    if (!this.state.time) {
      this.state.time = {
        now: Date.now(),
        lastTick: Date.now()
      };
    }

    // ===== DEVICE =====
    if (!this.state.device) {
      this.state.device = {};
    }

    this.state.device.temperature ??= 10;
    this.state.device.light ??= 0;
    this.state.device.battery ??= { voltage: 3.9 };
    this.state.device.fan ??= false;

    // ===== MEMORY (SAFE MIGRATION) =====
    if (!this.state.memory) this.state.memory = {};
    if (!this.state.memory.today) this.state.memory.today = {};
    if (!this.state.memory.history) this.state.memory.history = { days: [] };

    // ⬇⬇⬇ TADY BYL PROBLÉM ⬇⬇⬇
    if (!Array.isArray(this.state.memory.today.temperature))
      this.state.memory.today.temperature = [];

    if (!Array.isArray(this.state.memory.today.light))
      this.state.memory.today.light = [];

    if (!Array.isArray(this.state.memory.history.days))
      this.state.memory.history.days = [];

    // ===== INTERNÍ PROMĚNNÉ =====
    this.lastMeasureTemp = 0;
    this.lastMeasureLight = 0;

    this.dailyMinMax = {
      minTemp: null,
      maxTemp: null,
      minLight: null,
      maxLight: null,
      date: this.currentDateString()
    };
  }

  // ===== TICK =====
  tick() {
    const now = Date.now();
    const deltaMs = now - this.state.time.lastTick;

    this.state.time.lastTick = now;
    this.state.time.now = now;

    const hours = this.getHourFraction();

    this.simulateWorld(hours, deltaMs);
    this.measureIfNeeded(hours, now);
    this.handleDayChange();
  }

  // ===== SVĚT =====
  simulateWorld(hours, deltaMs) {
    // světlo
    let lightBase = 0;
    if (hours >= 6 && hours <= 20) {
      const x = (hours - 6) / 14;
      lightBase = Math.sin(Math.PI * x) * 100000;
    }

    const cloudNoise = (Math.random() - 0.5) * 5000;
    this.state.device.light = Math.max(0, lightBase + cloudNoise);

    // teplota
    const target = hours >= 6 && hours <= 20 ? 22 : 8;
    const diff = target - this.state.device.temperature;

    this.state.device.temperature += diff * 0.001 * (deltaMs / 1000);
    this.state.device.temperature += (Math.random() - 0.5) * 0.02;
  }

  // ===== MĚŘENÍ =====
  measureIfNeeded(hours, now) {
    const isDay = hours >= 6 && hours <= 20;

    const tempInterval = isDay ? 5 * 60_000 : 20 * 60_000;
    const lightInterval = isDay ? 5 * 60_000 : 30 * 60_000;

    if (now - this.lastMeasureTemp >= tempInterval) {
      this.lastMeasureTemp = now;
      const t = this.state.device.temperature;

      this.state.memory.today.temperature.push({
        t: new Date(now).toLocaleTimeString(),
        v: Number(t.toFixed(2))
      });

      this.updateDailyMinMax("temp", t);
    }

    if (now - this.lastMeasureLight >= lightInterval) {
      this.lastMeasureLight = now;
      const l = this.state.device.light;

      this.state.memory.today.light.push({
        t: new Date(now).toLocaleTimeString(),
        v: Math.round(l)
      });

      this.updateDailyMinMax("light", l);
    }
  }

  // ===== MIN / MAX =====
  updateDailyMinMax(type, value) {
    if (type === "temp") {
      this.dailyMinMax.minTemp =
        this.dailyMinMax.minTemp === null ? value : Math.min(this.dailyMinMax.minTemp, value);
      this.dailyMinMax.maxTemp =
        this.dailyMinMax.maxTemp === null ? value : Math.max(this.dailyMinMax.maxTemp, value);
    }

    if (type === "light") {
      this.dailyMinMax.minLight =
        this.dailyMinMax.minLight === null ? value : Math.min(this.dailyMinMax.minLight, value);
      this.dailyMinMax.maxLight =
        this.dailyMinMax.maxLight === null ? value : Math.max(this.dailyMinMax.maxLight, value);
    }
  }

  // ===== DEN =====
  handleDayChange() {
    const today = this.currentDateString();

    if (this.dailyMinMax.date !== today) {
      this.state.memory.history.days.push({ ...this.dailyMinMax });

      this.state.memory.today.temperature = [];
      this.state.memory.today.light = [];

      this.dailyMinMax = {
        minTemp: null,
        maxTemp: null,
        minLight: null,
        maxLight: null,
        date: today
      };

      if (this.state.memory.history.days.length > 7) {
        this.state.memory.history.days.shift();
      }
    }
  }

  // ===== HELPERS =====
  getHourFraction() {
    const d = new Date(this.state.time.now);
    return d.getHours() + d.getMinutes() / 60;
  }

  currentDateString() {
    return new Date(this.state.time.now).toISOString().slice(0, 10);
  }

  getState() {
    return this.state;
  }
}
