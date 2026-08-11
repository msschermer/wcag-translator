import express from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { securityMiddleware } from "./middleware/security.js";
import { requestId } from "./middleware/request-id.js";
import { rateLimit } from "./middleware/rate-limit.js";
import { notFound, errorHandler } from "./middleware/errors.js";
import { apiRouter } from "./api/routes.js";
import { config } from "./config/config.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

export function createApp() {
  const app = express();

  securityMiddleware(app);
  app.use(requestId);
  app.use(express.json({ limit: config.maxBodyBytes }));
  app.use(express.urlencoded({ extended: false, limit: config.maxBodyBytes }));

  app.use("/v1", rateLimit(), apiRouter());

  app.use(
    express.static(path.join(root, "public"), {
      index: "index.html",
      maxAge: "1h",
      extensions: ["html"]
    })
  );

  app.use(notFound);
  app.use(errorHandler);

  return app;
}
