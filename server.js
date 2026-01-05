console.log("SERVER START: booting...");

import fs from "fs";
import express from "express";
import cors from "cors";
import Simulator from "./simulator.js";

const app = express();
app.use(cors({ origin: "*" }));

let initialState = {};
try {
  if (fs.existsSync("./state.json")) {
    initialState = JSON.parse(fs.readFileSync("./state.json", "utf8"));
  }
} catch (e) {
  console.warn("⚠️ State load failed, starting clean");
}

const simulator = new Simulator(initialState);

setInterval(() => {
  simulator.tick();
  fs.writeFileSync(
    "./state.json",
    JSON.stringify(simulator.getState(), null, 2)
  );
}, 1000);

app.get("/state", (req, res) => {
  res.json(simulator.getState());
});

const PORT = process.env.PORT || 8080;
app.listen(PORT, () => {
  console.log("SERVER LISTENING");
  console.log("✅ Simulator běží na portu", PORT);
});
