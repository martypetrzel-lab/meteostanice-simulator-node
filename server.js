import express from "express";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { Simulator } from "./simulator.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 8080;

/* ================== CORS ================== */
app.use((req, res, next) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  next();
});

/* ================== LOAD STATE ================== */
let initialState = {};
try {
  const raw = fs.readFileSync(path.join(__dirname, "state.json"), "utf-8");
  initialState = JSON.parse(raw);
} catch {
  console.warn("⚠️ state.json nenalezen – startuji s prázdným stavem");
}

/* ================== SIMULATOR ================== */
const simulator = new Simulator(initialState);

setInterval(() => {
  simulator.tick();
}, 1000);

/* ================== API ================== */
app.get("/state", (req, res) => {
  res.json(simulator.getState());
});

/* ================== START ================== */
app.listen(PORT, () => {
  console.log(`✅ Meteostanice backend běží na portu ${PORT}`);
});
