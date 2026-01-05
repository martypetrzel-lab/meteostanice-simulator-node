import fs from "fs";

const STATE_FILE = "./state.json";

/* =========================
   HELPERY
   ========================= */
function nowLabel(ts) {
  const d = new Date(ts);
  return d.toTimeString().slice(0, 8); // HH:MM:SS
}

function loadState() {
  return JSON.parse(fs.readFileSync(STATE_FILE, "utf-8"));
}

function saveState(state) {
  fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
}

/* =========================
   SIMULATOR
   ========================= */
class Simulator {
  constructor() {
    this.state = loadState();
  }

  tick() {
    const s = this.state;
    const now = Date.now();

    /* ---- TIME ---- */
    s.time = {
      now,
      isDay: true
    };

    /* ---- WORLD ---- */
    const tempNoise = (Math.random() - 0.5) * 0.1;
    const lightBase = 300 + Math.random() * 400;

    s.world = {
      environment: {
        temperature: s.device.temperature + tempNoise,
        light: lightBase
      },
      time: s.time
    };

    /* ---- DEVICE / SENSORS ---- */
    s.sensors = {
      temperature: Number(s.world.environment.temperature.toFixed(2)),
      humidity: 50,
      light: Math.round(lightBase)
    };

    const solar = Math.max(0, s.sensors.light / 1000);
    const load = 0.18;

    s.power = {
      solarInW: Number(solar.toFixed(3)),
      loadW: load,
      balanceWh: Number(((solar - load) / 3600).toFixed(6))
    };

    s.battery = {
      voltage: Number((3.7 + s.power.balanceWh).toFixed(2)),
      soc: Math.min(1, Math.max(0, s.battery.soc + s.power.balanceWh))
    };

    s.device = {
      temperature: s.sensors.temperature,
      humidity: s.sensors.humidity,
      light: s.sensors.light,
      battery: s.battery,
      power: s.power,
      fan: false
    };

    /* ---- MEMORY ---- */
    const tLabel = nowLabel(now);

    if (!s.memory.today) {
      s.memory.today = {
        temperature: [],
        energyIn: [],
        energyOut: []
      };
    }

    s.memory.today.temperature.push({ t: tLabel, v: s.sensors.temperature });
    s.memory.today.energyIn.push({ t: tLabel, v: s.power.solarInW });
    s.memory.today.energyOut.push({ t: tLabel, v: s.power.loadW });

    /* ---- BRAIN ---- */
    s.message =
      s.power.solarInW > s.power.loadW
        ? "Dostatek energie, nabíjím"
        : "Podmínky stabilní, sbírám data";

    s.details = [
      `SOC: ${(s.battery.soc * 100).toFixed(0)} %`,
      `Světlo: ${s.sensors.light} lx`
    ];

    saveState(s);
  }
}

/* =========================
   START – 1 SEKUNDA
   ========================= */
const simulator = new Simulator();
setInterval(() => simulator.tick(), 1000);
