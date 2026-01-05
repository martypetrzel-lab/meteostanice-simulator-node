console.log("SERVER START: booting...");

import fs from "fs";
import express from "express";
import cors from "cors";
import Simulator from "./simulator.js";

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

/* ===== API ===== */
app.get("/state", (req, res) => {
  res.json(simulator.state);
});

/* ===== START SERVER ===== */
const PORT = process.env.PORT || 3000;
console.log("SERVER READY: starting listen");

app.listen(PORT, () => {
  console.log("SERVER LISTENING");
  console.log("✅ Simulator běží na portu", PORT);

  // ⚠️ interval spouštíme AŽ KDYŽ SERVER POSLOUCHÁ
  setInterval(() => {
    simulator.tick();
    fs.writeFileSync(
      "./state.json",
      JSON.stringify(simulator.state, null, 2)
    );
  }, 1000);
});
