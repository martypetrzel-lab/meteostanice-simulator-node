import fs from "fs";
import { updateBrain } from "./brain.js";

const STATE_FILE = "./state.json";

let state = JSON.parse(fs.readFileSync(STATE_FILE, "utf8"));

function nowTime() {
  return new Date().toLocaleTimeString("cs-CZ");
}

function tick() {
  const now = Date.now();
  state.time.now = now;

  /* 🌍 svět */
  state.world.environment.temperature += (Math.random() - 0.5) * 0.05;
  state.world.environment.light += (Math.random() - 0.4) * 20;
  state.world.environment.light = Math.max(0, Math.min(800, state.world.environment.light));

  /* 🔧 zařízení */
  state.device.temperature = state.world.environment.temperature;
  state.device.light = state.world.environment.light;

  state.device.power.solarInW = Number((state.device.light / 1000).toFixed(3));

  const deltaWh = (state.device.power.solarInW - state.device.power.loadW) / 3600;
  state.device.battery.soc = Math.min(1, Math.max(0, state.device.battery.soc + deltaWh));
  state.device.battery.voltage = Number((3.0 + state.device.battery.soc * 1.2).toFixed(2));

  /* 🧠 mozek */
  const brain = updateBrain(state);
  state.message = brain.message;
  state.details = brain.details;

  /* 📝 paměť */
  const t = nowTime();
  state.memory.today.temperature.push({ t, v: Number(state.device.temperature.toFixed(2)) });
  state.memory.today.energyIn.push({ t, v: state.device.power.solarInW });
  state.memory.today.energyOut.push({ t, v: state.device.power.loadW });

  if (state.memory.today.temperature.length > 300) {
    state.memory.today.temperature.shift();
    state.memory.today.energyIn.shift();
    state.memory.today.energyOut.shift();
  }

  fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
}

setInterval(tick, 1000);
console.log("⏱️ Simulator běží (1s tick)");
