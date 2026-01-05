// server.js
import express from "express";
import cors from "cors";
import { Simulator } from "./simulator.js";

const app = express();
app.use(cors());

const simulator = new Simulator();

setInterval(() => simulator.tick(), 1000);

app.get("/state", (req, res) => {
  res.json(simulator.getState());
});

const PORT = process.env.PORT || 8080;
app.listen(PORT, () =>
  console.log(`✅ Meteostanice běží na portu ${PORT}`)
);
