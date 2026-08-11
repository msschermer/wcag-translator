import test from "node:test";
import assert from "node:assert/strict";

import { startTestServer } from "./helpers.js";

let api;
test.before(async () => { api = await startTestServer(); });
test.after(async () => { await api.close(); });

const ids = (payload) => payload.data.translation.results.map((r) => r.criterion.id);

test("maps accessible name language to 4.1.2 with high confidence", async () => {
  const res = await api.post("/v1/translate", { query: "my button has no accessible name" });
  const payload = await res.json();

  assert.equal(res.status, 200);
  assert.ok(ids(payload).includes("4.1.2"));
  assert.equal(payload.data.translation.results[0].match.confidence, "high");
  assert.equal(payload.data.translation.results[0].match.basis, "phrase");
});

test("handles plurals the vocabulary stores in singular", async () => {
  const res = await api.post("/v1/translate", { query: "my form fields do not have labels" });
  const payload = await res.json();
  assert.ok(ids(payload).includes("1.3.1"));
});

test("does not fire on a substring of a vocabulary keyword", async () => {
  const res = await api.post("/v1/translate", { query: "the filename is wrong" });
  const payload = await res.json();
  assert.equal(ids(payload).length, 0, "matched a criterion on a substring collision");
});

test("respects the level filter", async () => {
  const res = await api.post("/v1/translate", { query: "focus indicator is not visible", level: "AAA" });
  const payload = await res.json();
  for (const result of payload.data.translation.results) {
    assert.equal(result.criterion.level, "AAA");
  }
});

test("respects the version filter", async () => {
  const res = await api.get("/v1/translate?q=elements%20have%20complete%20start%20and%20end%20tags&version=2.2");
  const payload = await res.json();
  assert.ok(!ids(payload).includes("4.1.1"), "4.1.1 was removed in WCAG 2.2");
});

test("every response carries W3C attribution and marks added fields", async () => {
  const res = await api.post("/v1/translate", { query: "the text contrast is too low" });
  const payload = await res.json();
  assert.equal(payload.attribution.source, "w3c");
  assert.ok(payload.attribution.documents.length >= 2);
  assert.equal(payload.data.translation.results[0].criterion.source, "w3c");
  assert.equal(payload.data.translation.results[0].match.source, "wcag-translator");
});

test("rejects an empty query", async () => {
  const res = await api.post("/v1/translate", {});
  assert.equal(res.status, 400);
});

test("rejects an invalid level", async () => {
  const res = await api.post("/v1/translate", { query: "contrast", level: "AAAA" });
  assert.equal(res.status, 400);
});

test("rejects malformed JSON with 400 rather than 500", async () => {
  const res = await api.post("/v1/translate", "{not json");
  assert.equal(res.status, 400);
});

test("rejects an oversized query", async () => {
  const res = await api.post("/v1/translate", { query: "x".repeat(501) });
  assert.equal(res.status, 400);
});
