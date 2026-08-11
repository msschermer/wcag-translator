import test from "node:test";
import assert from "node:assert/strict";

import { loadData } from "../src/data/loader.js";

// These are the regressions that took the previous build down. Each one failed
// silently at runtime rather than at build time, which is why they are asserted
// here rather than trusted to a manual smoke test.
test("glossary is populated from the W3C `terms` key", () => {
  const data = loadData();
  assert.ok(data.glossary.length > 0, "glossary is empty - W3C renamed `glossary` to `terms`");
  assert.ok(data.glossaryByName.get("accessible name"));
});

test("criterion handle is the short name, not the requirement sentence", () => {
  const criterion = loadData().byNum.get("4.1.2");
  assert.equal(criterion.handle, "Name, Role, Value");
  assert.ok(criterion.requirement.length > criterion.handle.length);
});

test("techniques nested under and/using/groups are extracted", () => {
  const data = loadData();
  assert.ok(data.techniqueById.get("G143"), "technique inside an `and` block was dropped");
  assert.ok(data.techniqueById.get("ARIA6"), "technique inside a `groups` block was dropped");
});

test("situation group anchors are never emitted as techniques", () => {
  for (const technique of loadData().techniques) {
    assert.match(technique.id, /^[A-Z]+\d+$/, `"${technique.id}" is a section anchor, not a technique`);
  }
});

test("documentation links point at the version a criterion actually shipped in", () => {
  const data = loadData();
  assert.match(data.byNum.get("4.1.2").links.understanding, /WCAG22/);
  // 4.1.1 Parsing was removed in 2.2, so a WCAG22 Understanding URL would 404.
  assert.match(data.byNum.get("4.1.1").links.understanding, /WCAG21/);
});

test("W3C source content is preserved unchanged alongside derived text", () => {
  const criterion = loadData().byNum.get("1.4.3");
  assert.ok(criterion.content.includes("<p>"), "original W3C HTML was rewritten");
  assert.equal(criterion.derived.source, "wcag-translator");
});
