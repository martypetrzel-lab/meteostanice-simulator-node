// server.js
import express from "express";
import { Simulator } from "./simulator.js";

const app = express();
const sim = new Simulator();

setInterval(() => sim.tick(), 1000);

app.get("/api/state", (req, res) => {
  res.json(sim.getState());
});

app.listen(8080, () =>
  console.log("✅ Simulator běží na portu 8080")
);
