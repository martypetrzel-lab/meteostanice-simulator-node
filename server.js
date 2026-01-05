// server.js
import express from "express";
import { Simulator } from "./simulator.js";

const app = express();
const PORT = 8080;

const simulator = new Simulator();

setInterval(() => {
  simulator.tick();
}, 1000);

app.get("/", (req, res) => {
  res.send("Meteostanice simulator running");
});

app.get("/state", (req, res) => {
  res.json(simulator.state);
});

app.listen(PORT, () => {
  console.log(`✅ Simulator běží na portu ${PORT}`);
});
