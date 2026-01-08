import express from "express";
import cors from "cors";
import fs from "fs";
import { tick } from "./simulator.js";

const app = express();
app.use(cors());

let state = JSON.parse(fs.readFileSync("state.json", "utf8"));

setInterval(() => {
  state.time.now = Date.now();
  tick(state);
  fs.writeFileSync("state.json", JSON.stringify(state, null, 2));
}, 1000);

app.get("/state", (req, res) => {
  res.json(state);
});

app.listen(3000, () =>
  console.log("EIRA B 3.7 běží (stabilní)")
);
