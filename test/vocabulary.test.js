import test from "node:test";
import assert from "node:assert/strict";

import { matchVocabulary } from "../src/services/translator.js";
import { loadData } from "../src/data/loader.js";

const criteriaFor = (query) => new Set(matchVocabulary(query).flatMap((m) => m.criteria));

// The dictionary is tested independently of the WCAG data set: a phrase either
// fires on the wording a developer would use, or it does not. Coupling this to
// the fixture would only test which criteria happen to be in the fixture.

const SHOULD_MATCH = [
  ["my button has no accessible name", "4.1.2"],
  ["images are missing alt text", "1.1.1"],
  ["the text contrast is too low", "1.4.3"],
  ["the keyboard gets trapped in the modal", "2.1.2"],
  ["focus disappears behind the sticky header", "2.4.11"],
  ["my form fields do not have labels", "1.3.1"],
  ["toast notifications are never announced", "4.1.3"],
  ["tap targets are too small on mobile", "2.5.8"],
  ["voice control cannot activate the button because the label does not match", "2.5.3"],
  ["the autocomplete attribute is missing on the address field", "1.3.5"],
  ["the app is locked to portrait orientation", "1.3.4"],
  ["text is clipped when line height is increased", "1.4.12"],
  ["the heading is text baked into an image", "1.4.5"],
  ["a single key shortcut fires while typing in the search box", "2.1.4"],
  ["a pinch gesture is the only way to zoom the map", "2.5.1"],
  ["the button triggers on mousedown and cannot be cancelled", "2.5.2"],
  ["shaking the device is the only way to undo", "2.5.4"],
  ["our parallax scroll ignores prefers-reduced-motion", "2.3.3"],
  ["the nav is reordered between pages", "3.2.3"],
  ["the help link moves to a different place on every page", "3.2.6"],
  ["the error just says invalid with no suggestion", "3.3.3"],
  ["there is no confirmation step before the payment is submitted", "3.3.4"],
  ["there is no search or sitemap on the site", "2.4.5"],
  ["there is no breadcrumb showing where you are", "2.4.8"],
  ["the video has no audio description", "1.2.3"],
  ["the focus outline is too thin to see", "2.4.13"]
];

// Wording that is deliberately near a phrase without being it. These are where
// a loose `requires` group shows up as a confident wrong answer.
const SHOULD_NOT_MATCH = [
  "the filename is wrong",
  "the button colour is wrong",
  "our brand image needs updating",
  "the search results are slow to load",
  "the payment gateway is returning a 502",
  "we need to rotate the log files",
  "the help desk ticket was closed",
  "the video player is buffering",
  "line height looks a bit tight in the footer",
  "the error rate went up after the deploy"
];

for (const [query, expected] of SHOULD_MATCH) {
  test(`vocabulary: "${query}" reaches ${expected}`, () => {
    assert.ok(criteriaFor(query).has(expected), `expected ${expected}, got ${[...criteriaFor(query)].join(", ") || "nothing"}`);
  });
}

for (const query of SHOULD_NOT_MATCH) {
  test(`vocabulary: "${query}" stays quiet`, () => {
    const hits = matchVocabulary(query);
    assert.equal(hits.length, 0, `matched ${hits.map((h) => h.phrase).join(" | ")}`);
  });
}

test("every phrase maps to a criterion that exists in the WCAG source", () => {
  // build-data enforces this too, but failing here names the phrase.
  const { criteria, vocabulary } = loadData();
  const known = new Set(criteria.map((c) => c.num));
  const fixtureIsPartial = known.size < 80;

  for (const term of vocabulary.terms) {
    assert.ok(term.criteria.length, `"${term.phrase}" maps to nothing`);
    assert.ok(term.requires?.length, `"${term.phrase}" has no requires groups, so it can only match verbatim`);
    if (!fixtureIsPartial) {
      for (const num of term.criteria) {
        assert.ok(known.has(num), `"${term.phrase}" references missing criterion ${num}`);
      }
    }
  }
});

test("no two phrases claim the identical criteria set with identical signals", () => {
  const { vocabulary } = loadData();
  const seen = new Map();
  for (const term of vocabulary.terms) {
    const key = `${[...term.criteria].sort().join(",")}::${(term.requires || []).join("::")}`;
    assert.ok(!seen.has(key), `"${term.phrase}" duplicates "${seen.get(key)}"`);
    seen.set(key, term.phrase);
  }
});
