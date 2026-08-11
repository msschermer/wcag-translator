import test from "node:test";
import assert from "node:assert/strict";

import { startTestServer } from "./helpers.js";

let api;
test.before(async () => { api = await startTestServer(); });
test.after(async () => { await api.close(); });

test("health reports dataset age so staleness is observable", async () => {
  const res = await api.get("/v1/health");
  const payload = await res.json();
  assert.equal(res.status, 200);
  assert.equal(payload.data.status, "ok");
  assert.ok(payload.data.dataset.checksum);
  assert.equal(typeof payload.data.dataset.ageDays, "number");
  assert.equal(typeof payload.data.dataset.stale, "boolean");
});

test("meta lists every endpoint", async () => {
  const payload = await (await api.get("/v1/meta")).json();
  assert.ok(payload.data.endpoints.translate.length);
  assert.ok(payload.data.supportedVersions.includes("2.2"));
});

test("stats breaks the dataset down by level and technology", async () => {
  const payload = await (await api.get("/v1/stats")).json();
  assert.ok(payload.data.criteria.byLevel.A > 0);
  assert.ok(Object.keys(payload.data.techniques.byTechnology).length > 1);
});

test("the OpenAPI document is served, not just shipped", async () => {
  const res = await api.get("/v1/openapi.yaml");
  const body = await res.text();
  assert.equal(res.status, 200);
  assert.match(res.headers.get("content-type"), /yaml/);
  assert.match(body, /openapi: 3/);
});

test("security headers are set and CSP is enforced", async () => {
  const res = await api.get("/v1/health");
  assert.ok(res.headers.get("x-content-type-options"));
  assert.ok(res.headers.get("x-frame-options"));
  assert.match(res.headers.get("content-security-policy") || "", /default-src 'none'/);
  assert.equal(res.headers.get("x-powered-by"), null);
});

test("a request id is echoed back", async () => {
  const res = await api.get("/v1/health", { headers: { "x-request-id": "abc-123" } });
  assert.equal(res.headers.get("x-request-id"), "abc-123");
});

test("rate limit headers are present on every response", async () => {
  const res = await api.get("/v1/health");
  assert.ok(res.headers.get("x-ratelimit-limit"));
  assert.ok(res.headers.get("x-ratelimit-remaining"));
  assert.ok(res.headers.get("x-ratelimit-reset"));
});

test("data endpoints revalidate with an ETag", async () => {
  const first = await api.get("/v1/criteria/1.4.3");
  const etag = first.headers.get("etag");
  assert.ok(etag);
  const second = await api.get("/v1/criteria/1.4.3", { headers: { "if-none-match": etag } });
  assert.equal(second.status, 304);
});

test("static assets are served and not shadowed by the API router", async () => {
  for (const [path, type] of [
    ["/", "text/html"],
    ["/robots.txt", "text/plain"],
    ["/favicon.svg", "image/svg+xml"],
    ["/styles.css", "text/css"],
    ["/app.js", "javascript"]
  ]) {
    const res = await api.get(path);
    assert.equal(res.status, 200, `${path} did not serve`);
    // Plain substring: "image/svg+xml" is not a valid regex fragment.
    assert.ok(
      res.headers.get("content-type").includes(type),
      `${path} served as ${res.headers.get("content-type")}, expected ${type}`
    );
  }
});

test("robots keeps crawlers off the API without hiding the console", async () => {
  const body = await (await api.get("/robots.txt")).text();
  assert.match(body, /Disallow: \/v1\//);
  assert.match(body, /Allow: \/\$/);
});

test("unknown endpoints return a JSON 404", async () => {
  const res = await api.get("/v1/nope");
  const payload = await res.json();
  assert.equal(res.status, 404);
  assert.equal(payload.error.status, 404);
});
