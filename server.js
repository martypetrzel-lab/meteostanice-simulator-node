import express from "express";
import cors from "cors";
import { Simulator } from "./simulator.js";

const app = express();
app.use(cors());
app.use(express.json());

const simulator = new Simulator();
setInterval(() => simulator.tick(), 1000);

app.get("/state", (req, res) => {
  res.json(simulator.state);
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log("🚀 EIRA B 3.6 běží na portu", PORT);
});
