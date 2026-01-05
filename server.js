// server.js
import express from "express";
import { Simulator } from "./simulator.js";

const app = express();
const PORT = 8080;

const simulator = new Simulator();

// tick simulátoru každou sekundu
setInterval(() => {
  simulator.tick();
}, 1000);

// 🔹 STATE ENDPOINT (TOHLE CHYBĚLO)
app.get("/state", (req, res) => {
  res.json(simulator.state);
});

// 🔹 HEALTHCHECK (užitečné)
app.get("/", (req, res) => {
  res.send("Meteostanice simulator running");
});

app.listen(PORT, () => {
  console.log(`✅ Simulator běží na portu ${PORT}`);
});
