// server.js
import express from "express";
import cors from "cors";
import { Simulator } from "./simulator.js";

const app = express();
const simulator = new Simulator();

app.use(cors());

app.get("/state", (req, res) => {
  res.json(simulator.getState());
});

// ⏱️ TADY JE TEN KRITICKÝ ŘÁDEK
setInterval(() => {
  simulator.tick();
}, 1000);

const PORT = process.env.PORT || 8080;
app.listen(PORT, () => {
  console.log("Server běží na portu", PORT);
});
