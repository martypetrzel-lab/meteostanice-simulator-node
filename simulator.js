// simulator.js
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/* ===== NAČTENÍ STATE.JSON SPRÁVNĚ ===== */
const statePath = path.join(__dirname, "state.json");
let baseState = JSON.parse(fs.readFileSync(statePath, "utf-8"));

export class Simulator {
  constructor() {
    this.state = structuredClone(baseState);
    this.lastTick = Date.now();
  }

  tick() {
    const now = Date.now();
    const dt = (now - this.lastTick) / 1000;
    this.lastTick = now;

    /* === ČAS === */
    this.state.time.now = now;

    /* === SVĚT === */
    this.state.world.environment.temperature += (Math.random() - 0.5) * 0.05;
    this.state.world.environment.light =
      Math.max(0, Math.min(1000, this.state.world.environment.light + (Math.random() - 0.5) * 20));

    /* === ZAŘÍZENÍ === */
    this.state.device.temperature = this.state.world.environment.temperature;
    this.state.device.light = this.state.world.environment.light;

    /* === ENERGIE === */
    const solar = this.state.device.light / 1000;
    const load = this.state.power.loadW;

    this.state.power.solarInW = Number(solar.toFixed(3));
    this.state.power.balanceWh += ((solar - load) * dt) / 3600;

    /* === BATERIE === */
    this.state.battery.soc = Math.max(
      0,
      Math.min(1, this.state.battery.soc + ((solar - load) * dt) / 5000)
    );
    this.state.battery.voltage = 3.2 + this.state.battery.soc * 1.0;

    /* === PAMĚŤ (1s) === */
    const t = new Date(now).toLocaleTimeString("cs-CZ");

    this.state.memory.today.temperature.push({
      t,
      v: Number(this.state.device.temperature.toFixed(2))
    });

    this.state.memory.today.energyIn.push({
      t,
      v: this.state.power.solarInW
    });

    this.state.memory.today.energyOut.push({
      t,
      v: this.state.power.loadW
    });

    /* === OMEZENÍ POČTU BODŮ === */
    const max = 300;
    ["temperature", "energyIn", "energyOut"].forEach(k => {
      if (this.state.memory.today[k].length > max) {
        this.state.memory.today[k].shift();
      }
    });

    /* === MOZEK === */
    this.state.message = solar > load
      ? "Dostatek energie, nabíjím"
      : "Nízká energie, šetřím";

    this.state.details = [
      `SOC: ${(this.state.battery.soc * 100).toFixed(0)} %`,
      `Světlo: ${Math.round(this.state.device.light)} lx`
    ];
  }

  getState() {
    return this.state;
  }
}
