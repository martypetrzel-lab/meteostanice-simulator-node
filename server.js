// server.js
import express from "express";
import { Simulator } from "./simulator.js";

const app = express();
const PORT = process.env.PORT || 8080;

const simulator = new Simulator();

/* =========================
   CORS – POVOLENÍ UI
========================= */
app.use((req, res, next) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  next();
});

/* =========================
   API
========================= */
app.get("/state", (req, res) => {
  res.json(simulator.state);
});

/* =========================
   START
========================= */
setInterval(() => {
  simulator.tick();
}, 1000);

app.listen(PORT, () => {
  console.log(`✅ Simulator běží na portu ${PORT}`);
});
