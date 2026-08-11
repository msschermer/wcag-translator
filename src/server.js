import { createApp } from "./app.js";
import { loadData, dataDirectory } from "./data/loader.js";
import { config } from "./config/config.js";

// Fail fast. A process that boots with a broken data layer and only reveals it
// on the first request is exactly the failure mode this rebuild exists to kill.
const data = loadData();

const app = createApp();

const server = app.listen(config.port, "0.0.0.0", () => {
  console.log(
    JSON.stringify({
      level: "info",
      message: `${config.appName} ${config.version} listening on ${config.port}`,
      dataDirectory,
      dataset: data.index.counts,
      generatedAt: data.index.generatedAt,
      trustProxy: config.trustProxy
    })
  );
});

let shuttingDown = false;
function shutdown(signal) {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(JSON.stringify({ level: "info", message: `${signal} received, shutting down` }));
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(1), 10_000).unref();
}

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
