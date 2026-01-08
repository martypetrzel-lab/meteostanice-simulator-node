// server.js
import express from "express";
import cors from "cors";
import { tick } from "./simulator.js";
import state from "./state.json" assert { type: "json" };

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
  console.log("EIRA B 3.7.1 běží (stabilní)");
});
