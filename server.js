import express from "express";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 8080;

/* =========================
   CORS – POVOLIT GITHUB PAGES
   ========================= */
app.use((req, res, next) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  next();
});

/* =========================
   ENDPOINT: /state
   ========================= */
app.get("/state", (req, res) => {
  const statePath = path.join(__dirname, "state.json");

  try {
    const data = fs.readFileSync(statePath, "utf-8");
    res.json(JSON.parse(data));
  } catch (err) {
    res.status(500).json({ error: "State read failed" });
  }
});

/* =========================
   HEALTHCHECK
   ========================= */
app.get("/", (req, res) => {
  res.send("Meteostanice backend OK");
});

/* =========================
   START SERVER
   ========================= */
app.listen(PORT, () => {
  console.log(`Server běží na portu ${PORT}`);
});
