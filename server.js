import express from "express";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 8080;

// ====== STATE LOADER ======
function loadState() {
  const raw = fs.readFileSync(path.join(__dirname, "state.json"), "utf-8");
  return JSON.parse(raw);
}

// ====== API: STATE ======
app.get("/state", (req, res) => {
  try {
    const state = loadState();

    // 🔧 KOMPATIBILNÍ MAPOVÁNÍ PRO UI (KRITICKÉ)
    res.json({
      time: state.time,
      day: state.time?.dayIndex ?? "--",

      // UI DLAŽDICE
      sensors: {
        temperature: state.device?.temperature ?? null,
        light: state.device?.light ?? null
      },

      battery: {
        voltage: state.device?.battery?.voltage ?? null,
        soc: state.device?.battery?.soc ?? null
      },

      power: {
        in: state.device?.power?.solarInW ?? 0,
        out: state.device?.power?.loadW ?? 0,
        balanceWh: state.device?.power?.balanceWh ?? 0
      },

      // GRAFY
      memory: state.memory,

      // MOZEK
      brain: state.brain ?? {
        message: "Načítám…",
        details: []
      }
    });
  } catch (e) {
    res.status(500).json({ error: "State load failed", details: e.message });
  }
});

// ====== HEALTH ======
app.get("/", (req, res) => {
  res.send("Meteostanice simulator backend běží");
});

// ====== START ======
app.listen(PORT, () => {
  console.log(`Server běží na portu ${PORT}`);
});
