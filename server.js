import http from "http";
import { simulator } from "./simulator.js";

const PORT = process.env.PORT || 8080;

const server = http.createServer((req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Content-Type", "application/json");

  if (req.url === "/state") {
    res.end(JSON.stringify(simulator.getState()));
    return;
  }

  res.statusCode = 404;
  res.end();
});

server.listen(PORT, () => {
  console.log("Server běží na portu", PORT);
});
