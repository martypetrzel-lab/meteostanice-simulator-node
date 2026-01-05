// simulator.js
import fs from "fs";
import { updateBrain } from "./brain.js";

const STATE_FILE = "./state.json";

let state = JSON.parse(fs.readFileSync(STATE_FILE, "utf8"));

function nowTime() {
  return new Date().toLocaleTimeString("cs-CZ");
}

function clamp(v, min, max) {
  return Math.max(min, Math.min(max, v));
}

export function tick() {
  // ⏱️ reálný čas = sim čas (1s)
  state.time.now = Date.now();

  // 🌍 WORLD
  state.world.temperature += (Math.random() - 0.5) * 0.1;
  state.world.light = clamp(
    state.world.light + (Math.random() - 0.5) * 50,
    0,
    1000
  );

  // 🔌 DEVICE
  state.sensors.temperature = state.world.temperature;
  state.sensors.light = state.world.light;

  state.power.solarInW = state.world.light > 200
    ? +(Math.random() * 0.5 + 0.2).toFixed(3)
    : 0;

  state.power.loadW = 0.18;

  state.battery.soc = clamp(
    state.battery.soc +
      (state.power.solarInW - state.power.loadW) / 3600,
    0,
    1
  );

  state.battery.voltage = +(3.3 + state.battery.soc * 0.9).toFixed(2);

  // 🧠 BRAIN
  const brain = updateBrain(state);
  state.message = brain.message;
  state.details = brain.details;

  // 💾 MEMORY – 1 SEKUNDA
  const t = nowTime();

  state.memory.today.temperature.push({
    t,
    v: +state.sensors.temperature.toFixed(2)
  });

  state.memory.today.energyIn.push({
    t,
    v: state.power.solarInW
  });

  state.memory.today.energyOut.push({
    t,
    v: state.power.loadW
  });

  // LIMIT (poslední 5 minut)
  const LIMIT = 300;
  ["temperature", "energyIn", "energyOut"].forEach(k => {
    if (state.memory.today[k].length > LIMIT) {
      state.memory.today[k].shift();
    }
  });

  fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
}

// 🔁 HLAVNÍ SMYČKA – 1 SEKUNDA
setInterval(tick, 1000);
