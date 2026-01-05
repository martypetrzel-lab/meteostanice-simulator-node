import express from "express";
import cors from "cors";
import { Simulator } from "./simulator.js";

const app = express();
const sim = new Simulator();

app.use(cors());
app.use(express.static("public"));

app.get("/state", (req, res) => {
  res.json(sim.getState());
});

setInterval(() => sim.tick(1), 1000);

const PORT = process.env.PORT || 8080;
app.listen(PORT, () => {
  console.log("✅ Simulator běží na portu", PORT);
});
