import test from "node:test";
import assert from "node:assert/strict";

import { startTestServer } from "./helpers.js";

let api;
test.before(async () => { api = await startTestServer(); });
test.after(async () => { await api.close(); });

const axeReport = {
  url: "https://example.com/checkout",
  violations: [
    { id: "color-contrast", impact: "serious", nodes: [{}, {}, {}] },
    { id: "button-name", impact: "critical", nodes: [{}] },
    { id: "region", impact: "moderate", nodes: [{}] }
  ],
  incomplete: [{ id: "aria-hidden-focus", nodes: [{}] }]
};

test("an axe results object is recognised and rolled up by criterion", async () => {
  const res = await api.post("/v1/report", { report: axeReport });
  const payload = await res.json();

  assert.equal(res.status, 200);
  assert.equal(payload.data.report.format, "axe");
  assert.equal(payload.data.report.url, "https://example.com/checkout");
  assert.equal(payload.data.report.occurrences, 5);
  assert.deepEqual(payload.data.report.needsReview, ["aria-hidden-focus"]);

  const ids = payload.data.translation.results.map((r) => r.criterion.id);
  assert.ok(ids.includes("1.4.3"));
  assert.ok(ids.includes("4.1.2"));
});

test("node counts and impact carry through to the criterion", async () => {
  const payload = await (await api.post("/v1/report", { report: axeReport })).json();
  const contrast = payload.data.translation.results.find((r) => r.criterion.id === "1.4.3");
  assert.equal(contrast.match.occurrences, 3);
  assert.equal(contrast.match.impact, "serious");
});

test("results are ordered by impact then by how much of the page they affect", async () => {
  const payload = await (await api.post("/v1/report", { report: axeReport })).json();
  const order = { critical: 0, serious: 1, moderate: 2, minor: 3 };
  const impacts = payload.data.translation.results.map((r) => order[r.match.impact] ?? 9);
  assert.deepEqual(impacts, [...impacts].sort((a, b) => a - b));
});

test("a raw report can be posted without a wrapper", async () => {
  const res = await api.post("/v1/report", axeReport);
  const payload = await res.json();
  assert.equal(res.status, 200);
  assert.equal(payload.data.report.format, "axe");
});

test("a Lighthouse LHR is recognised and only failing audits count", async () => {
  const res = await api.post("/v1/report", {
    report: {
      finalUrl: "https://example.com/",
      audits: {
        "color-contrast": { score: 0, details: { items: [{}, {}] } },
        "image-alt": { score: 1 },
        "html-has-lang": { score: null, scoreDisplayMode: "notApplicable" },
        "button-name": { score: 0 }
      }
    }
  });
  const payload = await res.json();

  assert.equal(payload.data.report.format, "lighthouse");
  assert.equal(payload.data.report.findings, 2);
  const ids = payload.data.translation.results.map((r) => r.criterion.id);
  assert.ok(ids.includes("1.4.3"));
  assert.ok(!ids.includes("1.1.1"), "a passing audit must not appear");
});

test("a Pa11y issue array is recognised and its codes are parsed", async () => {
  const res = await api.post("/v1/report", {
    report: [
      { code: "WCAG2AA.Principle1.Guideline1_4.1_4_3.G18.Fail", type: "error" },
      { code: "WCAG2AA.Principle1.Guideline1_4.1_4_3.G18.Fail", type: "error" },
      { code: "WCAG2AA.Principle4.Guideline4_1.4_1_2.H91.InputText.Name", type: "error" }
    ]
  });
  const payload = await res.json();

  assert.equal(payload.data.report.format, "pa11y");
  assert.equal(payload.data.report.occurrences, 3);
  const contrast = payload.data.translation.results.find((r) => r.criterion.id === "1.4.3");
  assert.equal(contrast.match.occurrences, 2, "duplicate codes should be counted, not deduplicated away");
});

test("a bare array of rule ids is accepted", async () => {
  const res = await api.post("/v1/report", { report: ["image-alt", "color-contrast"] });
  const payload = await res.json();
  assert.equal(payload.data.report.format, "rule-ids");
  assert.equal(payload.data.translation.results.length, 2);
});

test("an unrecognised report shape explains what is supported", async () => {
  const res = await api.post("/v1/report", { report: { something: "else" } });
  const payload = await res.json();
  assert.equal(res.status, 400);
  assert.ok(payload.error.details.supported.length >= 3);
});

test("the report caveat keeps conformance with the reader and points at coverage", async () => {
  const payload = await (await api.post("/v1/report", { report: axeReport })).json();
  assert.match(payload.data.caveat, /human judgement/i);
  assert.match(payload.data.caveat, /coverage/);
});
