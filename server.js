import fs from "fs";
import express from "express";
import cors from "cors";
import { Simulator } from "./simulator.js";

const app = express();
app.use(cors({ origin: "*" }));

/* ===== LOAD STATE SAFE ===== */
let initialState = {};
try {
  if (fs.existsSync("./state.json")) {
    initialState = JSON.parse(fs.readFileSync("./state.json", "utf8"));
  }
} catch (e) {
  console.warn("⚠️ Nelze načíst state.json, startuji čistě");
}

/* ===== SIMULATOR ===== */
const simulator = new Simulator(initialState);

/* ===== TICK ===== */
setInterval(() => {
  simulator.tick();

  // uložit stav
  fs.writeFileSync(
    "./state.json",
    JSON.stringify(simulator.getState(), null, 2)
  );
}, 1000);

/* ===== API ===== */
app.get("/state", (req, res) => {
  res.json(simulator.getState());
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () =>
  console.log("✅ Simulator běží na portu", PORT)
);
