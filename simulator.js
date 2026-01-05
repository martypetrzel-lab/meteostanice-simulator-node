// simulator.js
import World from "./world.js";

export default class Simulator {
  constructor(state = {}) {
    this.state = state;

    /* ===== TIME ===== */
    this.state.time ??= {
      now: Date.now(),
      lastTick: Date.now()
    };

    /* ===== DEVICE ===== */
    this.state.device ??= {
      temperature: 15,
      light: 0,
      battery: {
        voltage: 3.9,
        soc: 0.6
      },
      fan: false
    };

    /* ===== MEMORY ===== */
    this.state.memory ??= {};
    this.state.memory.today ??= {};
    this.state.memory.today.temperature ??= [];
    this.state.memory.today.light ??= [];

    this.state.memory.history ??= { days: [] };

    /* ===== MOZEK ===== */
    this.state.brain ??= {
      mode: "learning", // learning | normal | saving | critical
      confidence: 0,
      prediction: {
        nextTemp: null,
        nextLight: null
      },
      decisions: {
        fan: false
      },
      message: "Učím se prostředí"
    };

    /* ===== WORLD ===== */
    this.world = new World();

    /* ===== INTERVALY ===== */
    this.lastTempMeasure = 0;
    this.lastLightMeasure = 0;
  }

  /* ======================= */
  tick() {
    const now = Date.now();
    const delta = now - this.state.time.lastTick;
    this.state.time.lastTick = now;
    this.state.time.now = now;

    // 1️⃣ Svět
    const worldData = this.world.simulate(now);
    this.state.device.light = worldData.light;

    // 2️⃣ Teplota – pomalá reakce na svět
    const tempTarget = worldData.isDay ? 22 : 10;
    this.state.device.temperature +=
      (tempTarget - this.state.device.temperature) * 0.001;

    // 3️⃣ Měření
    this.measure(now, worldData.isDay);

    // 4️⃣ MOZEK
    this.brainTick(worldData.isDay);

    return this.state;
  }

  /* ======================= */
  measure(now, isDay) {
    const tempInterval = isDay ? 5 * 60_000 : 20 * 60_000;
    const lightInterval = isDay ? 5 * 60_000 : 30 * 60_000;

    if (now - this.lastTempMeasure > tempInterval) {
      this.lastTempMeasure = now;
      this.state.memory.today.temperature.push({
        t: new Date(now).toLocaleTimeString(),
        v: Number(this.state.device.temperature.toFixed(2))
      });
    }

    if (now - this.lastLightMeasure > lightInterval) {
      this.lastLightMeasure = now;
      this.state.memory.today.light.push({
        t: new Date(now).toLocaleTimeString(),
        v: Math.round(this.state.device.light)
      });
    }
  }

  /* ======================= */
  brainTick(isDay) {
    const tempHist = this.state.memory.today.temperature;
    const lightHist = this.state.memory.today.light;

    // ===== TRENDY =====
    const tempTrend =
      tempHist.length > 2
        ? tempHist[tempHist.length - 1].v -
          tempHist[tempHist.length - 2].v
        : 0;

    const lightTrend =
      lightHist.length > 2
        ? lightHist[lightHist.length - 1].v -
          lightHist[lightHist.length - 2].v
        : 0;

    // ===== PREDIKCE =====
    this.state.brain.prediction.nextTemp =
      this.state.device.temperature + tempTrend * 10;

    this.state.brain.prediction.nextLight =
      this.state.device.light + lightTrend * 10;

    // ===== CONFIDENCE =====
    this.state.brain.confidence = Math.min(
      1,
      this.state.brain.confidence + 0.0005
    );

    // ===== REŽIM =====
    if (this.state.brain.confidence < 0.3) {
      this.state.brain.mode = "learning";
      this.state.brain.message = "Učím se chování prostředí";
    } else {
      this.state.brain.mode = "normal";
      this.state.brain.message = "Podmínky stabilní, analyzuji";
    }

    // ===== ROZHODNUTÍ (ZATÍM JEN DOPORUČENÍ) =====
    const shouldCool =
      this.state.brain.prediction.nextTemp > 25 &&
      this.state.device.battery.soc > 0.5 &&
      isDay;

    this.state.brain.decisions.fan = shouldCool;
  }

  /* ======================= */
  getState() {
    return this.state;
  }
}
