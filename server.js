import express from "express";
import { Simulator } from "./simulator.js";
import fs from "fs";

const app = express();
const PORT = process.env.PORT || 8080;
const STATE_FILE = "./state.json";

const simulator = new Simulator();
simulator.start();

app.use((req, res, next) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  next();
});

app.get("/state", (req, res) => {
  const raw = JSON.parse(fs.readFileSync(STATE_FILE, "utf-8"));

  res.json({
    time: raw.time,
    world: raw.world,
    sensors: {
      temperature: raw.device.temperature,
      humidity: raw.device.humidity,
      light: raw.device.light
    },
    battery: raw.device.battery,
    power: raw.device.power,
    fan: raw.device.fan,
    memory: raw.memory,
    message: raw.message,
    details: raw.details
  });
});

app.listen(PORT, () => {
  console.log(`Server běží na portu ${PORT}`);
});
