import { config } from "../config/config.js";
import { errorResponse } from "../utils/response.js";

// Fixed window counters held in process memory. Correct for a single container,
// which is what this runs as. Horizontal scaling needs a shared store; that
// swap is noted in the README rather than pretended away here.
const buckets = new Map();

const sweep = setInterval(() => {
  const now = Date.now();
  for (const [key, bucket] of buckets) {
    if (now - bucket.startedAt > bucket.windowMs) buckets.delete(key);
  }
}, 60_000);
sweep.unref();

function identify(req) {
  const headerKey = req.get("x-api-key");
  if (headerKey && config.apiKeys.includes(headerKey)) return { key: `key:${headerKey}`, authenticated: true };

  const authorization = req.get("authorization");
  if (authorization?.startsWith("Bearer ")) {
    const bearer = authorization.slice(7).trim();
    if (config.apiKeys.includes(bearer)) return { key: `key:${bearer}`, authenticated: true };
  }

  return { key: `ip:${req.ip}`, authenticated: false };
}

export function rateLimit() {
  return (req, res, next) => {
    const now = Date.now();
    const { key, authenticated } = identify(req);

    const limit = authenticated ? config.apiRateLimit : config.publicRateLimit;
    const windowMs = authenticated ? config.apiRateWindowMs : config.publicRateWindowMs;

    let bucket = buckets.get(key);
    if (!bucket || now - bucket.startedAt >= windowMs) {
      bucket = { startedAt: now, count: 0, windowMs };
      buckets.set(key, bucket);
    }
    bucket.count += 1;

    const resetSeconds = Math.ceil((bucket.startedAt + windowMs) / 1000);
    res.setHeader("X-RateLimit-Limit", String(limit));
    res.setHeader("X-RateLimit-Remaining", String(Math.max(0, limit - bucket.count)));
    res.setHeader("X-RateLimit-Reset", String(resetSeconds));

    if (bucket.count > limit) {
      res.setHeader("Retry-After", String(Math.max(1, Math.ceil((bucket.startedAt + windowMs - now) / 1000))));
      return errorResponse(res, 429, "Rate limit exceeded.", {
        limit,
        windowSeconds: Math.round(windowMs / 1000),
        authenticated
      });
    }

    return next();
  };
}

export function resetRateLimits() {
  buckets.clear();
}
