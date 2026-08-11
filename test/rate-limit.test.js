import test from "node:test";
import assert from "node:assert/strict";

import { startTestServer } from "./helpers.js";

// Lives in its own file because exhausting the limiter would otherwise poison
// every test that runs after it. node --test gives each file its own process.
let api;
test.before(async () => { api = await startTestServer(); });
test.after(async () => { await api.close(); });

test("the rate limiter actually returns 429 once the window is spent", async () => {
  // Deterministic: drive the limiter to its configured ceiling rather than
  // mutating env vars after config.js has already been imported.
  const limit = Number((await api.get("/v1/health")).headers.get("x-ratelimit-limit"));
  let last;
  for (let i = 0; i < limit + 2; i += 1) last = await api.get("/v1/health");
  assert.equal(last.status, 429);
  assert.ok(last.headers.get("retry-after"));
});
