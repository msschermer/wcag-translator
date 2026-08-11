import test from "node:test";
import assert from "node:assert/strict";

import { startTestServer } from "./helpers.js";

let api;
test.before(async () => { api = await startTestServer(); });
test.after(async () => { await api.close(); });

test("criterion lookup works by number and by slug", async () => {
  for (const key of ["1.4.3", "contrast-minimum", "SC 1.4.3", "wcag-1.4.3"]) {
    const res = await api.get(`/v1/criteria/${encodeURIComponent(key)}`);
    const payload = await res.json();
    assert.equal(res.status, 200, `lookup failed for ${key}`);
    assert.equal(payload.data.num, "1.4.3");
  }
});

test("unknown criterion returns 404 with a hint", async () => {
  const res = await api.get("/v1/criteria/9.9.9");
  const payload = await res.json();
  assert.equal(res.status, 404);
  assert.ok(payload.error.details.hint);
});

test("criteria collection supports filtering and pagination", async () => {
  const res = await api.get("/v1/criteria?level=AA&limit=2&offset=0");
  const payload = await res.json();
  assert.equal(res.status, 200);
  assert.ok(payload.data.length <= 2);
  assert.ok(payload.meta.total >= payload.data.length);
  for (const item of payload.data) assert.equal(item.level, "AA");
});

test("technique lookup is case insensitive", async () => {
  const res = await api.get("/v1/techniques/h37");
  const payload = await res.json();
  assert.equal(res.status, 200);
  assert.equal(payload.data.id, "H37");
  assert.ok(payload.data.url.includes("/Techniques/html/H37"));
});

test("techniques can be filtered by the criterion they support", async () => {
  const res = await api.get("/v1/techniques?criterion=4.1.2");
  const payload = await res.json();
  assert.ok(payload.data.length > 0);
  for (const t of payload.data) assert.ok(t.criteria.includes("4.1.2"));
});

test("glossary lookup works by name, slug and id", async () => {
  for (const key of ["accessible name", "accessible-name", "dfn-accessible-name"]) {
    const res = await api.get(`/v1/glossary/${encodeURIComponent(key)}`);
    assert.equal(res.status, 200, `glossary lookup failed for ${key}`);
  }
});

test("search returns ranked results across all three indexes", async () => {
  const res = await api.get("/v1/search?q=contrast%20ratio");
  const payload = await res.json();
  assert.equal(res.status, 200);
  assert.ok(payload.data.criteria.length > 0);
  assert.ok(payload.data.glossary.length > 0);
  assert.equal(payload.data.criteria[0].id, "1.4.3");
  const scores = payload.data.criteria.map((c) => c.relevance);
  assert.deepEqual(scores, [...scores].sort((a, b) => b - a), "results are not ranked");
});

test("search requires a query", async () => {
  const res = await api.get("/v1/search");
  assert.equal(res.status, 400);
});
