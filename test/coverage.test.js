import test from "node:test";
import assert from "node:assert/strict";

import { startTestServer } from "./helpers.js";

let api;
test.before(async () => { api = await startTestServer(); });
test.after(async () => { await api.close(); });

test("coverage classifies every criterion", async () => {
  const res = await api.get("/v1/coverage");
  const payload = await res.json();

  assert.equal(res.status, 200);
  const { summary, criteria } = payload.data;
  assert.equal(summary.automated + summary.assisted + summary["manual-only"], summary.total);
  assert.equal(criteria.length, summary.total);
  for (const entry of criteria) {
    assert.ok(["automated", "assisted", "manual-only"].includes(entry.coverage));
  }
});

test("a criterion an engine claims is automated", async () => {
  const payload = await (await api.get("/v1/criteria/1.4.3/coverage")).json();
  assert.equal(payload.data.coverage, "automated");
  assert.ok(payload.data.rules.some((rule) => rule.id === "color-contrast"));
});

test("a criterion no rule reaches is manual-only, not an error", async () => {
  const res = await api.get("/v1/criteria/2.4.11/coverage");
  const payload = await res.json();
  assert.equal(res.status, 200);
  assert.equal(payload.data.coverage, "manual-only");
  assert.equal(payload.data.ruleCount, 0);
});

test("a locally supplied mapping never counts as automated coverage", async () => {
  // Mappings this service adds, and Lighthouse's manual prompts, are listed on
  // a criterion but must not upgrade it to "an engine claims this". Asserted
  // structurally rather than against one criterion, so the guarantee holds as
  // the vocabulary and alias files grow.
  const payload = await (await api.get("/v1/coverage")).json();

  let assisted = 0;
  for (const entry of payload.data.criteria) {
    const engineClaimed = entry.rules.some((rule) => rule.mappingSource === "axe-core");

    if (entry.coverage === "automated") {
      assert.ok(engineClaimed, `${entry.criterion} is automated with no engine-published mapping`);
    }
    if (entry.rules.length && !engineClaimed) {
      assert.equal(entry.coverage, "assisted", `${entry.criterion} has only local mappings but is not assisted`);
      assisted += 1;
    }
  }

  assert.ok(assisted > 0, "the fixture should exercise at least one assisted criterion");
});

test("coverage can be filtered", async () => {
  const payload = await (await api.get("/v1/coverage?coverage=manual-only")).json();
  for (const entry of payload.data.criteria) assert.equal(entry.coverage, "manual-only");
});

test("related criteria are ranked by shared techniques", async () => {
  const payload = await (await api.get("/v1/criteria/4.1.2/related")).json();
  const counts = payload.data.related.map((r) => r.sharedTechniques);
  assert.deepEqual(counts, [...counts].sort((a, b) => b - a));
  assert.ok(!payload.data.related.some((r) => r.id === "4.1.2"), "a criterion is not related to itself");
});

test("stats carries the coverage rollup", async () => {
  const payload = await (await api.get("/v1/stats")).json();
  assert.ok(payload.data.coverage.total > 0);
  assert.equal(typeof payload.data.coverage.automatedPercent, "number");
  assert.ok(payload.data.checkerRules.engines.axe.version);
});
