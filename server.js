import http from "http";
import { Simulator } from "./simulator.js";

const sim = new Simulator();

setInterval(() => sim.tick(), 1000);

const server = http.createServer((req, res) => {
  if (req.url === "/state") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify(sim.getState(), null, 2));
    return;
  }

  res.writeHead(404);
  res.end("Not Found");
});

server.listen(8080, () => {
  console.log("✅ Simulator běží na portu 8080");
});
