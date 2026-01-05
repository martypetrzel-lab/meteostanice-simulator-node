import express from "express";
import fs from "fs";

const app = express();
const PORT = process.env.PORT || 8080;
const STATE_FILE = "./state.json";

app.use((req, res, next) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  next();
});

app.get("/state", (req, res) => {
  const raw = JSON.parse(fs.readFileSync(STATE_FILE, "utf-8"));

  // ⬇️ MAPOVÁNÍ PRO UI
  const uiState = {
    time: raw.time,
    world: raw.world,

    sensors: {
      temperature: raw.device.temperature,
      humidity: raw.device.humidity ?? 50,
      light: raw.device.light
    },

    battery: {
      voltage: raw.device.battery.voltage,
      soc: raw.device.battery.soc
    },

    power: raw.device.power,
    fan: raw.device.fan,

    memory: raw.memory,

    message: raw.message,
    details: raw.details
  };

  res.json(uiState);
});

app.listen(PORT, () => {
  console.log(`Server běží na portu ${PORT}`);
});
