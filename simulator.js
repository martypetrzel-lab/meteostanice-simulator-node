// simulator.js
// ZÁLOHA 0.2 – SIMULACE SVĚTA (TEPLOTA + SVĚTLO)
// Reálný den / noc, řízené měření, žádné 1s nesmysly

export default class Simulator {
  constructor(state) {
    // ====== INIT STATE ======
    this.state = state ?? {};

    if (!this.state.time) {
      this.state.time = {
        now: Date.now(),
        lastTick: Date.now()
      };
    }

    if (!this.state.device) {
      this.state.device = {
        temperature: 10,
        light: 0,
        battery: { voltage: 3.9 },
        fan: false
      };
    }

    if (!this.state.memory) {
      this.state.memory = {
        today: {
          temperature: [],
          light: []
        },
        history: {
          days: [] // { date, minTemp, maxTemp, minLight, maxLight }
        }
      };
    }

    // ====== INTERNÍ PROMĚNNÉ ======
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

  // ====== HLAVNÍ TICK ======
  tick() {
    const now = Date.now();
    const deltaMs = now - this.state.time.lastTick;
    this.state.time.lastTick = now;
    this.state.time.now = now;

    const hours = this.getHourFraction();

    // === SVĚT ===
    this.simulateWorld(hours, deltaMs);

    // === ROZHODOVÁNÍ ===
    this.measureIfNeeded(hours, now);

    // === DENNÍ UZÁVĚRKA ===
    this.handleDayChange();

    return this.state;
  }

  // ====== SVĚT (FYZIKA) ======
  simulateWorld(hours, deltaMs) {
    // ---- SVĚTLO ----
    // denní křivka (slunce)
    let lightBase = 0;
    if (hours >= 6 && hours <= 20) {
      const x = (hours - 6) / 14; // 0..1
      lightBase = Math.sin(Math.PI * x) * 100000; // max cca 100k lx
    }

    // jemné změny (mraky)
    const cloudNoise = (Math.random() - 0.5) * 5000;
    this.state.device.light = Math.max(0, lightBase + cloudNoise);

    // ---- TEPLOTA ----
    const dayTarget = 22;
    const nightTarget = 8;
    const targetTemp =
      hours >= 6 && hours <= 20 ? dayTarget : nightTarget;

    // pomalý přechod
    const diff = targetTemp - this.state.device.temperature;
    this.state.device.temperature += diff * 0.001 * (deltaMs / 1000);

    // mikro šum
    this.state.device.temperature += (Math.random() - 0.5) * 0.02;
  }

  // ====== MĚŘENÍ (ROZHODUJE ZAŘÍZENÍ) ======
  measureIfNeeded(hours, now) {
    const isDay = hours >= 6 && hours <= 20;

    // intervaly měření
    const tempInterval = isDay ? 5 * 60_000 : 20 * 60_000;
    const lightInterval = isDay ? 5 * 60_000 : 30 * 60_000;

    // ---- TEPLOTA ----
    if (now - this.lastMeasureTemp >= tempInterval) {
      this.lastMeasureTemp = now;

      const t = this.state.device.temperature;
      this.state.memory.today.temperature.push({
        t: new Date(now).toLocaleTimeString(),
        v: Number(t.toFixed(2))
      });

      this.updateDailyMinMax("temp", t);
    }

    // ---- SVĚTLO ----
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

  // ====== MIN / MAX ======
  updateDailyMinMax(type, value) {
    if (type === "temp") {
      if (this.dailyMinMax.minTemp === null || value < this.dailyMinMax.minTemp)
        this.dailyMinMax.minTemp = value;
      if (this.dailyMinMax.maxTemp === null || value > this.dailyMinMax.maxTemp)
        this.dailyMinMax.maxTemp = value;
    }

    if (type === "light") {
      if (
        this.dailyMinMax.minLight === null ||
        value < this.dailyMinMax.minLight
      )
        this.dailyMinMax.minLight = value;
      if (
        this.dailyMinMax.maxLight === null ||
        value > this.dailyMinMax.maxLight
      )
        this.dailyMinMax.maxLight = value;
    }
  }

  // ====== DENNÍ UZÁVĚRKA ======
  handleDayChange() {
    const today = this.currentDateString();

    if (this.dailyMinMax.date !== today) {
      // uložit včerejšek
      this.state.memory.history.days.push({ ...this.dailyMinMax });

      // reset dne
      this.state.memory.today.temperature = [];
      this.state.memory.today.light = [];

      this.dailyMinMax = {
        minTemp: null,
        maxTemp: null,
        minLight: null,
        maxLight: null,
        date: today
      };

      // max 7 dní historie
      if (this.state.memory.history.days.length > 7) {
        this.state.memory.history.days.shift();
      }
    }
  }

  // ====== POMOCNÉ ======
  getHourFraction() {
    const d = new Date(this.state.time.now);
    return d.getHours() + d.getMinutes() / 60;
  }

  currentDateString() {
    return new Date(this.state.time.now).toISOString().slice(0, 10);
  }
}
