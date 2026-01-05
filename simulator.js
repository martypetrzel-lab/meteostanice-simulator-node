// simulator.js
// ZÁLOHA 0.2 – SIMULACE SVĚTA (TEPLOTA + SVĚTLO)
// Reálný den / noc, řízené měření, denní min/max

export default class Simulator {
  constructor(state = {}) {
    this.state = state;

    this.state.time ??= {
      now: Date.now(),
      lastTick: Date.now()
    };

    this.state.device ??= {
      temperature: 10,
      light: 0,
      battery: { voltage: 3.9 },
      fan: false
    };

    this.state.memory ??= {
      today: {
        temperature: [],
        light: []
      },
      history: {
        days: []
      }
    };

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

  /* ===== HLAVNÍ TICK ===== */
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

  /* ===== SVĚT ===== */
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
    const targetTemp = hours >= 6 && hours <= 20 ? 22 : 8;
    const diff = targetTemp - this.state.device.temperature;

    this.state.device.temperature += diff * 0.001 * (deltaMs / 1000);
    this.state.device.temperature += (Math.random() - 0.5) * 0.02;
  }

  /* ===== MĚŘENÍ ===== */
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

  /* ===== MIN / MAX ===== */
  updateDailyMinMax(type, value) {
    if (type === "temp") {
      this.dailyMinMax.minTemp ??= value;
      this.dailyMinMax.maxTemp ??= value;

      this.dailyMinMax.minTemp = Math.min(this.dailyMinMax.minTemp, value);
      this.dailyMinMax.maxTemp = Math.max(this.dailyMinMax.maxTemp, value);
    }

    if (type === "light") {
      this.dailyMinMax.minLight ??= value;
      this.dailyMinMax.maxLight ??= value;

      this.dailyMinMax.minLight = Math.min(this.dailyMinMax.minLight, value);
      this.dailyMinMax.maxLight = Math.max(this.dailyMinMax.maxLight, value);
    }
  }

  /* ===== DENNÍ UZÁVĚRKA ===== */
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

  /* ===== POMOCNÉ ===== */
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
