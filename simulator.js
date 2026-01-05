// simulator.js
// ZÁLOHA 0.2 – SAFE MIGRACE
// odolné vůči starým datům, null hodnotám a změnám struktury

export default class Simulator {
  constructor(state = {}) {
    this.state = state;

    /* ===== TIME ===== */
    if (!this.state.time) {
      this.state.time = {
        now: Date.now(),
        lastTick: Date.now()
      };
    }

    /* ===== WORLD ===== */
    if (!this.state.world) {
      this.state.world = {
        environment: {
          temperature: 15,
          light: 0
        }
      };
    }

    /* ===== DEVICE ===== */
    if (!this.state.device) this.state.device = {};

    if (typeof this.state.device.temperature !== "number") {
      this.state.device.temperature =
        this.state.world.environment.temperature ?? 15;
    }

    if (typeof this.state.device.light !== "number") {
      this.state.device.light =
        this.state.world.environment.light ?? 0;
    }

    if (!this.state.device.battery) {
      this.state.device.battery = { voltage: 3.9 };
    }

    if (typeof this.state.device.fan !== "boolean") {
      this.state.device.fan = false;
    }

    /* ===== MEMORY ===== */
    if (!this.state.memory) this.state.memory = {};

    // ❌ odstranění starého bordelu
    delete this.state.memory.days;

    if (!this.state.memory.today) {
      this.state.memory.today = {};
    }

    if (!Array.isArray(this.state.memory.today.temperature)) {
      this.state.memory.today.temperature = [];
    }

    if (!Array.isArray(this.state.memory.today.light)) {
      this.state.memory.today.light = [];
    }

    if (!this.state.memory.history) {
      this.state.memory.history = { days: [] };
    }

    if (!Array.isArray(this.state.memory.history.days)) {
      this.state.memory.history.days = [];
    }

    /* ===== INTERNÍ PROMĚNNÉ ===== */
    this.lastMeasureTemp = 0;
    this.lastMeasureLight = 0;

    this.dailyMinMax = {
      date: this.currentDateString(),
      minTemp: null,
      maxTemp: null,
      minLight: null,
      maxLight: null
    };
  }

  /* ===== TICK ===== */
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

  /* ===== WORLD ===== */
  simulateWorld(hours, deltaMs) {
    // světlo
    let light = 0;
    if (hours >= 6 && hours <= 20) {
      const x = (hours - 6) / 14;
      light = Math.sin(Math.PI * x) * 100000;
    }
    light += (Math.random() - 0.5) * 5000;
    light = Math.max(0, light);

    this.state.world.environment.light = light;
    this.state.device.light = light;

    // teplota
    const target = hours >= 6 && hours <= 20 ? 22 : 8;
    const diff = target - this.state.device.temperature;

    this.state.device.temperature +=
      diff * 0.001 * (deltaMs / 1000);

    this.state.device.temperature +=
      (Math.random() - 0.5) * 0.02;
  }

  /* ===== MĚŘENÍ ===== */
  measureIfNeeded(hours, now) {
    const isDay = hours >= 6 && hours <= 20;

    const tempInterval = isDay ? 5 * 60_000 : 20 * 60_000;
    const lightInterval = isDay ? 5 * 60_000 : 30 * 60_000;

    // TEPLOTA
    if (now - this.lastMeasureTemp >= tempInterval) {
      this.lastMeasureTemp = now;

      const t = this.state.device.temperature;
      if (Number.isFinite(t)) {
        this.state.memory.today.temperature.push({
          t: new Date(now).toLocaleTimeString(),
          v: Number(t.toFixed(2))
        });
        this.updateMinMax("temp", t);
      }
    }

    // SVĚTLO
    if (now - this.lastMeasureLight >= lightInterval) {
      this.lastMeasureLight = now;

      const l = this.state.device.light;
      if (Number.isFinite(l)) {
        this.state.memory.today.light.push({
          t: new Date(now).toLocaleTimeString(),
          v: Math.round(l)
        });
        this.updateMinMax("light", l);
      }
    }
  }

  /* ===== MIN / MAX ===== */
  updateMinMax(type, value) {
    if (type === "temp") {
      this.dailyMinMax.minTemp =
        this.dailyMinMax.minTemp === null
          ? value
          : Math.min(this.dailyMinMax.minTemp, value);

      this.dailyMinMax.maxTemp =
        this.dailyMinMax.maxTemp === null
          ? value
          : Math.max(this.dailyMinMax.maxTemp, value);
    }

    if (type === "light") {
      this.dailyMinMax.minLight =
        this.dailyMinMax.minLight === null
          ? value
          : Math.min(this.dailyMinMax.minLight, value);

      this.dailyMinMax.maxLight =
        this.dailyMinMax.maxLight === null
          ? value
          : Math.max(this.dailyMinMax.maxLight, value);
    }
  }

  /* ===== DENNÍ UZÁVĚRKA ===== */
  handleDayChange() {
    const today = this.currentDateString();

    if (this.dailyMinMax.date !== today) {
      this.state.memory.history.days.push({ ...this.dailyMinMax });

      if (this.state.memory.history.days.length > 7) {
        this.state.memory.history.days.shift();
      }

      this.state.memory.today.temperature = [];
      this.state.memory.today.light = [];

      this.dailyMinMax = {
        date: today,
        minTemp: null,
        maxTemp: null,
        minLight: null,
        maxLight: null
      };
    }
  }

  /* ===== HELPERS ===== */
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
