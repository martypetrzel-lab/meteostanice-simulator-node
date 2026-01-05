// server.js
import express from "express";
import { Simulator } from "./simulator.js";

const app = express();
const simulator = new Simulator();

/* ===== CORS RUČNĚ (BEZ BALÍKU) ===== */
app.use((req, res, next) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  next();
});

/* ===== API ===== */
app.get("/state", (req, res) => {
  res.json(simulator.getState());
});

/* ===== SIMULACE 1s = 1s ===== */
setInterval(() => {
  simulator.tick();
}, 1000);

const PORT = process.env.PORT || 8080;
app.listen(PORT, () => {
  console.log("Server běží na portu", PORT);
});
