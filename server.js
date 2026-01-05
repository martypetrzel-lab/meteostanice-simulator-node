import express from "express";
import cors from "cors";
import { Simulator } from "./simulator.js";

const app = express();
const PORT = process.env.PORT || 8080;

app.use(cors());

const simulator = new Simulator();

// 1s = 1 tick simulace
setInterval(() => {
  simulator.tick();
}, 1000);

app.get("/state", (req, res) => {
  res.json(simulator.getState());
});

app.listen(PORT, () => {
  console.log("✅ Meteostanice běží na portu", PORT);
});
