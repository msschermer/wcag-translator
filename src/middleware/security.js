import cors from "cors";
import helmet from "helmet";
import compression from "compression";

import { config } from "../config/config.js";

export function securityMiddleware(app) {
  // Must be a number of hops, not a string. See config.js for why.
  app.set("trust proxy", config.trustProxy);

  app.use(
    helmet({
      // The demo page has no inline script or style, so a real policy costs
      // nothing here. Turning CSP off entirely, as the previous build did, is
      // a poor look on a tool that exists to talk about web standards.
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'none'"],
          baseUri: ["'none'"],
          formAction: ["'self'"],
          frameAncestors: ["'none'"],
          scriptSrc: ["'self'"],
          styleSrc: ["'self'"],
          fontSrc: ["'self'"],
          imgSrc: ["'self'", "data:"],
          connectSrc: ["'self'"],
          objectSrc: ["'none'"]
        }
      },
      referrerPolicy: { policy: "no-referrer" },
      crossOriginResourcePolicy: { policy: "cross-origin" }
    })
  );

  app.use(
    cors({
      origin: config.corsOrigin === "*" ? "*" : config.corsOrigin.split(",").map((v) => v.trim()),
      methods: ["GET", "POST", "OPTIONS"],
      allowedHeaders: ["Content-Type", "Authorization", "X-API-Key", "X-Request-ID"],
      exposedHeaders: [
        "X-Request-ID",
        "X-RateLimit-Limit",
        "X-RateLimit-Remaining",
        "X-RateLimit-Reset",
        "Retry-After"
      ],
      maxAge: 86_400
    })
  );

  app.use(compression());
  app.disable("x-powered-by");
  app.disable("etag"); // set deliberately per route instead
}
