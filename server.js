import express from "express";
import fs from "fs";

const app = express();
const PORT = process.env.PORT || 8080;
const STATE_FILE = "./state.json";

/* CORS – nutné pro GitHub Pages */
app.use((req, res, next) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET");
  next();
});

app.get("/state", (req, res) => {
  try {
    const state = JSON.parse(fs.readFileSync(STATE_FILE, "utf8"));
    res.json(state);
  } catch {
    res.status(500).json({ error: "state not ready" });
  }
});

app.listen(PORT, () => {
  console.log("🌐 Server běží na portu", PORT);
});
