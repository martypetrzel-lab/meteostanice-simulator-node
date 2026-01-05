import express from "express";
import { Simulator } from "./simulator.js";
import state from "./state.json" assert { type: "json" };

const app = express();
const PORT = process.env.PORT || 8080;

/* ✅ Simulator dostane EXISTUJÍCÍ state */
const simulator = new Simulator(state);

setInterval(() => {
  simulator.tick();
}, 1000);

app.get("/state", (req, res) => {
  res.json(simulator.getState());
});

app.listen(PORT, () => {
  console.log(`✅ Meteostanice běží na portu ${PORT}`);
});
