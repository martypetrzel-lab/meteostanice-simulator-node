import express from "express";
import cors from "cors";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

import { tick } from "./simulator.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// načtení state.json (lokální varianta)
const statePath = path.join(__dirname, "state.json");
const state = JSON.parse(fs.readFileSync(statePath, "utf-8"));

const app = express();
app.use(cors());

// UI static
const publicDir = path.join(__dirname, "public");
app.use(express.static(publicDir));

setInterval(() => {
  state.time.now += 1000;
  tick(state);
}, 1000);

app.get("/state", (req, res) => res.json(state));

app.get("/health", (req, res) => {
  res.json({ ok: true, version: "UI-prototype", now: state?.time?.now ?? null });
});

// fallback na index (kdyby někdo otevřel /dnes apod.)
app.get("*", (req, res) => {
  res.sendFile(path.join(publicDir, "index.html"));
});

const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log("EIRA UI Prototype běží (Railway compatible)");
});
