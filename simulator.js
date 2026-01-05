// simulator.js
// ZÁLOHA 0.2 – stabilní simulátor světa + energie + větrák (reálná fyzika)

export default class Simulator {
  constructor(state = {}) {
    /* ========= KONSTANTY ========= */
    this.BASE_LOAD_W = 0.10;        // ESP32 + senzory
    this.FAN_POWER_W = 1.0;         // 5V * 0.2A
    this.STEPUP_EFF = 0.85;         // účinnost měniče
    this.SOLAR_MAX_W = 2.5;         // panel (simulace)

    /* ========= STAV ========= */
    this.state = state;

    this.state.time ??= {
      now: Date.now(),
      lastTick: Date.now()
    };

    this.state.device ??= {
      temperature: 15,
      humidity: 50,
      light: 0,
      fan: false,
      battery: {
        voltage: 3.9,
        soc: 0.6
      },
      power: {
        solarInW: 0,
        loadW: 0,
        balanceWh: 0
      }
    };

    this.state.memory ??= {
      today: {
        temperature: [],
        light: [],
        energyIn: [],
        energyOut: []
      },
      history: {
        days: []
      }
    };

    /* ========= INTERNÍ ========= */
    this.lastTempMeasure = 0;
    this.lastLightMeasure = 0;
    this.lastEnergyLog = 0;

    this.dailyMinMax = {
      date: this.currentDate(),
      minTemp: null,
      maxTemp: null
    };
  }

  /* ================= TICK ================= */
  tick() {
    const now = Date.now();
    const deltaH = (now - this.state.time.lastTick) / 3_600_000;
    this.state.time.lastTick = now;
    this.state.time.now = now;

    const hour = this.hourFraction();

    this.simulateWorld(hour);
    this.simulateEnergy(hour, deltaH);
    this.decideFan(hour);
    this.measureIfNeeded(now);
    this.handleDayChange();

    return this.state;
  }

  /* ================= SVĚT ================= */
  simulateWorld(hour) {
    /* ----- SVĚTLO ----- */
    let sun = 0;
    if (hour >= 6 && hour <= 20) {
      const x = (hour - 6) / 14;
      sun = Math.sin(Math.PI * x);
    }

    const clouds = 0.6 + Math.random() * 0.4;
    this.state.device.light = Math.round(sun * clouds * 100000);

    /* ----- TEPLOTA ----- */
    const target = hour >= 6 && hour <= 20 ? 22 : 8;
    const diff = target - this.state.device.temperature;
    this.state.device.temperature += diff * 0.002;
    this.state.device.temperature += (Math.random() - 0.5) * 0.05;
  }

  /* ================= ENERGIE ================= */
  simulateEnergy(hour, deltaH) {
    const soc = this.state.device.battery.soc;

    /* SOLAR */
    const solarFactor = Math.max(0, Math.min(1, this.state.device.light / 100000));
    const solarW = solarFactor * this.SOLAR_MAX_W;

    /* LOAD */
    let loadW = this.BASE_LOAD_W;
    if (this.state.device.fan) {
      loadW += this.FAN_POWER_W / this.STEPUP_EFF; // ~1.18 W
    }

    /* BALANCE */
    const balanceW = solarW - loadW;
    const balanceWh = balanceW * deltaH;

    /* SOC */
    let newSoc = soc + balanceWh / 10; // 10 Wh baterie (model)
    newSoc = Math.max(0, Math.min(1, newSoc));

    this.state.device.battery.soc = newSoc;
    this.state.device.battery.voltage = 3.0 + newSoc * 1.2;

    this.state.device.power = {
      solarInW: Number(solarW.toFixed(3)),
      loadW: Number(loadW.toFixed(3)),
      balanceWh: Number(balanceWh.toFixed(4))
    };

    /* LOG ENERGIE (5 min) */
    if (Date.now() - this.lastEnergyLog > 5 * 60_000) {
      this.lastEnergyLog = Date.now();

      this.state.memory.today.energyIn.push({
        t: new Date().toLocaleTimeString(),
        v: Number(solarW.toFixed(3))
      });

      this.state.memory.today.energyOut.push({
        t: new Date().toLocaleTimeString(),
        v: Number(loadW.toFixed(3))
      });
    }
  }

  /* ================= ROZHODOVÁNÍ ================= */
  decideFan(hour) {
    const t = this.state.device.temperature;
    const soc = this.state.device.battery.soc;
    const isDay = hour >= 6 && hour <= 20;

    /* LOGIKA:
       - chladit jen když má smysl
       - neohrozit noc
    */
    if (t > 28 && soc > 0.5 && isDay) {
      this.state.device.fan = true;
    } else if (soc < 0.4 || !isDay || t < 24) {
      this.state.device.fan = false;
    }
  }

  /* ================= MĚŘENÍ ================= */
  measureIfNeeded(now) {
    if (now - this.lastTempMeasure > 5 * 60_000) {
      this.lastTempMeasure = now;
      const v = this.state.device.temperature;

      this.state.memory.today.temperature.push({
        t: new Date().toLocaleTimeString(),
        v: Number(v.toFixed(2))
      });

      this.updateMinMax(v);
    }

    if (now - this.lastLightMeasure > 10 * 60_000) {
      this.lastLightMeasure = now;

      this.state.memory.today.light.push({
        t: new Date().toLocaleTimeString(),
        v: this.state.device.light
      });
    }
  }

  updateMinMax(v) {
    if (this.dailyMinMax.minTemp === null || v < this.dailyMinMax.minTemp)
      this.dailyMinMax.minTemp = v;
    if (this.dailyMinMax.maxTemp === null || v > this.dailyMinMax.maxTemp)
      this.dailyMinMax.maxTemp = v;
  }

  /* ================= DEN ================= */
  handleDayChange() {
    const today = this.currentDate();
    if (this.dailyMinMax.date !== today) {
      this.state.memory.history.days.push({ ...this.dailyMinMax });

      if (this.state.memory.history.days.length > 7) {
        this.state.memory.history.days.shift();
      }

      this.state.memory.today = {
        temperature: [],
        light: [],
        energyIn: [],
        energyOut: []
      };

      this.dailyMinMax = {
        date: today,
        minTemp: null,
        maxTemp: null
      };
    }
  }

  /* ================= POMOCNÉ ================= */
  hourFraction() {
    const d = new Date(this.state.time.now);
    return d.getHours() + d.getMinutes() / 60;
  }

  currentDate() {
    return new Date(this.state.time.now).toISOString().slice(0, 10);
  }

  getState() {
    return this.state;
  }
}
