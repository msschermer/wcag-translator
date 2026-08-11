const numberFromEnv = (name, fallback) => {
  const value = Number(process.env[name]);
  return Number.isFinite(value) ? value : fallback;
};

const list = (value = "") => value.split(",").map((v) => v.trim()).filter(Boolean);

// Express interprets a STRING trust proxy value as a comma separated list of
// trusted addresses. ipaddr.js happily parses "1" as the IPv4 address 0.0.0.1,
// so `app.set("trust proxy", "1")` does not throw - it just quietly trusts
// nobody. Behind Caddy that makes every request look like it came from the
// proxy's container IP, collapsing per-IP rate limiting into one global bucket.
// Coercing to a number is the whole fix.
const trustProxyFromEnv = () => {
  const raw = process.env.TRUST_PROXY;
  if (raw === undefined || raw === "") return 1;
  if (/^\d+$/.test(raw.trim())) return Number(raw.trim());
  if (raw === "true") return true;
  if (raw === "false") return false;
  return raw; // hostname or CIDR list, which Express does handle as a string
};

export const config = {
  port: numberFromEnv("PORT", 3000),
  nodeEnv: process.env.NODE_ENV || "development",
  appName: process.env.APP_NAME || "WCAG Translator",
  version: process.env.APP_VERSION || "3.0.0",
  corsOrigin: process.env.CORS_ORIGIN || "*",
  trustProxy: trustProxyFromEnv(),
  dataDir: process.env.WCAG_DATA_DIR || null,
  maxQueryLength: numberFromEnv("MAX_QUERY_LENGTH", 500),
  maxBodyBytes: numberFromEnv("MAX_BODY_BYTES", 20_000),
  publicRateLimit: numberFromEnv("PUBLIC_RATE_LIMIT", 60),
  publicRateWindowMs: numberFromEnv("PUBLIC_RATE_WINDOW_MS", 60_000),
  apiRateLimit: numberFromEnv("API_RATE_LIMIT", 300),
  apiRateWindowMs: numberFromEnv("API_RATE_WINDOW_MS", 60_000),
  apiKeys: list(process.env.API_KEYS)
};

export const isProduction = config.nodeEnv === "production";
