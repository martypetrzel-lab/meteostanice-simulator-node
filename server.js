// server.js
import express from "express";
import cors from "cors";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

import { tick } from "./simulator.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// bezpečné načtení state.json
const statePath = path.join(__dirname, "state.json");
const state = JSON.parse(fs.readFileSync(statePath, "utf-8"));

const app = express();
app.use(cors());

setInterval(() => {
  state.time.now += 1000;
  tick(state);
}, 1000);

app.get("/state", (req, res) => {
  res.json(state);
});

const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log("EIRA B 3.7.2 běží (Railway compatible)");
});
