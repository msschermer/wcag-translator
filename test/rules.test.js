import test from "node:test";
import assert from "node:assert/strict";

import { startTestServer } from "./helpers.js";

let api;
test.before(async () => { api = await startTestServer(); });
test.after(async () => { await api.close(); });

const criteriaOf = (payload) => payload.data.translation.results.map((r) => r.criterion.id);

test("an axe rule id resolves to the criteria axe itself tags it with", async () => {
  const res = await api.post("/v1/translate/rule", { rule: "color-contrast" });
  const payload = await res.json();

  assert.equal(res.status, 200);
  assert.deepEqual(criteriaOf(payload), ["1.4.3"]);
  assert.equal(payload.data.rules[0].mappingSource, "axe-core");
  assert.equal(payload.data.translation.results[0].match.basis, "rule-mapping");
});

test("a rule result is shape-identical to a language result", async () => {
  const fromRule = await (await api.post("/v1/translate/rule", { rule: "button-name" })).json();
  const fromText = await (await api.post("/v1/translate", { query: "my button has no accessible name" })).json();

  const a = fromRule.data.translation.results[0];
  const b = fromText.data.translation.results[0];

  assert.deepEqual(Object.keys(a).sort(), Object.keys(b).sort());
  assert.deepEqual(Object.keys(a.criterion).sort(), Object.keys(b.criterion).sort());
  assert.equal(a.criterion.id, b.criterion.id);
});

test("a batch of rules rolls up to deduplicated criteria", async () => {
  const res = await api.post("/v1/translate/rule", {
    rules: ["button-name", "link-name", "input-button-name", "color-contrast"]
  });
  const payload = await res.json();

  const ids = criteriaOf(payload);
  assert.equal(new Set(ids).size, ids.length, "criteria were not deduplicated");
  assert.ok(ids.includes("4.1.2"));

  const nameRole = payload.data.translation.results.find((r) => r.criterion.id === "4.1.2");
  assert.ok(nameRole.match.rules.length > 1, "the rollup should list every rule that led here");
});

test("Pa11y HTML_CodeSniffer codes are parsed rather than looked up", async () => {
  const res = await api.post("/v1/translate/rule", {
    rule: "WCAG2AA.Principle1.Guideline1_4.1_4_3.G18.Fail"
  });
  const payload = await res.json();

  assert.deepEqual(criteriaOf(payload), ["1.4.3"]);
  assert.equal(payload.data.rules[0].engine, "pa11y");
  assert.equal(payload.data.rules[0].resolution, "parsed");
});

test("a best-practice rule with no WCAG tag resolves but is flagged, not 404'd", async () => {
  const res = await api.post("/v1/translate/rule", { rule: "accesskeys" });
  const payload = await res.json();

  assert.equal(res.status, 200);
  assert.equal(payload.data.rules[0].resolved, true);
  assert.equal(payload.data.rules[0].wcagMapped, false);
  assert.match(payload.data.rules[0].note, /best practice|experimental/i);
  assert.equal(payload.data.translation.results.length, 0);
});

test("an unknown rule id returns suggestions instead of silence", async () => {
  const res = await api.post("/v1/translate/rule", { rule: "colour-contrast" });
  const payload = await res.json();

  assert.equal(payload.data.rules[0].resolved, false);
  assert.ok(payload.data.rules[0].suggestions.includes("color-contrast"));
});

test("filtering explains what it excluded rather than dropping it silently", async () => {
  const res = await api.post("/v1/translate/rule", { rule: "color-contrast", level: "A" });
  const payload = await res.json();

  assert.equal(payload.data.translation.results.length, 0);
  assert.ok(payload.data.rules[0].excluded.some((e) => e.criterion === "1.4.3"));
});

test("locally supplied mappings are labelled as ours, not as engine metadata", async () => {
  const res = await api.get("/v1/rules/empty-heading");
  const payload = await res.json();
  assert.equal(payload.data.criteriaSource, "wcag-translator");
  assert.ok(payload.data.criteriaNote);
});

test("the rule catalogue is listable and filterable by criterion", async () => {
  const res = await api.get("/v1/rules?criterion=4.1.2&limit=200");
  const payload = await res.json();

  assert.ok(payload.data.length > 3);
  for (const rule of payload.data) assert.ok(rule.criteria.includes("4.1.2"));
  assert.ok(payload.meta.engines.axe.version);
});

test("GET accepts a comma separated list for quick CLI use", async () => {
  const res = await api.get("/v1/translate/rule?rule=image-alt,color-contrast");
  const payload = await res.json();
  assert.equal(payload.data.input.count, 2);
});

test("batch size is capped", async () => {
  const res = await api.post("/v1/translate/rule", { rules: new Array(101).fill("color-contrast") });
  assert.equal(res.status, 400);
});

test("a missing rule field is a 400 with an example", async () => {
  const res = await api.post("/v1/translate/rule", {});
  const payload = await res.json();
  assert.equal(res.status, 400);
  assert.ok(payload.error.details.example);
});
