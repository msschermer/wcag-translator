// Automated coverage analysis.
//
// The most useful thing this data set can say that no scanner will tell you is
// how much of WCAG automation can see at all. Every criterion is classified by
// whether any automated checker rule maps to it, which makes the honest answer
// to "we run axe in CI, are we accessible?" a number rather than a shrug.

import { loadData } from "../data/loader.js";
import { ruleIndex } from "./rules.js";

let cache = null;

function build() {
  if (cache) return cache;

  const data = loadData();
  const rules = ruleIndex().rules;

  const rulesByCriterion = new Map();
  for (const rule of rules) {
    for (const num of rule.criteria) {
      if (!rulesByCriterion.has(num)) rulesByCriterion.set(num, []);
      rulesByCriterion.get(num).push(rule);
    }
  }

  const byCriterion = new Map();

  for (const criterion of data.criteria) {
    const matched = rulesByCriterion.get(criterion.num) || [];

    // A rule only counts as automated coverage when the engine itself claims
    // the WCAG link. Mappings this service supplies, and Lighthouse's manual
    // audits, are listed but do not upgrade the classification.
    const engineMapped = matched.filter(
      (rule) => rule.criteriaSource === "axe-core" && !rule.tags.includes("manual")
    );

    let level;
    if (engineMapped.length) level = "automated";
    else if (matched.length) level = "assisted";
    else level = "manual-only";

    byCriterion.set(criterion.num, {
      criterion: criterion.num,
      handle: criterion.handle,
      level: criterion.level,
      versions: criterion.versions,
      coverage: level,
      ruleCount: matched.length,
      engineRuleCount: engineMapped.length,
      rules: matched.map((rule) => ({
        id: rule.id,
        engine: rule.engine,
        mappingSource: rule.criteriaSource || rule.source,
        helpUrl: rule.helpUrl
      })),
      techniqueCount: criterion.techniques.length,
      note:
        level === "automated"
          ? "At least one checker rule claims this criterion, so a scan can surface some of its failures. A clean scan narrows the question rather than settling it."
          : level === "assisted"
            ? "Reached by a manual prompt or a mapping this service supplies. Useful as a reminder; the engine itself makes no claim here."
            : "This one is yours to judge. No automated rule reaches it, so it is decided by a person looking at the page."
    });
  }

  // Related criteria by shared techniques. Two criteria satisfied by the same
  // techniques tend to fail together, which is exactly what a developer wants
  // to see next.
  const criteriaByTechnique = new Map();
  for (const criterion of data.criteria) {
    for (const technique of criterion.techniques) {
      if (!criteriaByTechnique.has(technique.id)) criteriaByTechnique.set(technique.id, new Set());
      criteriaByTechnique.get(technique.id).add(criterion.num);
    }
  }

  const related = new Map();
  for (const criterion of data.criteria) {
    const counts = new Map();
    for (const technique of criterion.techniques) {
      for (const other of criteriaByTechnique.get(technique.id) || []) {
        if (other === criterion.num) continue;
        counts.set(other, (counts.get(other) || 0) + 1);
      }
    }

    related.set(
      criterion.num,
      [...counts.entries()]
        .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], undefined, { numeric: true }))
        .slice(0, 8)
        .map(([num, shared]) => {
          const other = data.byNum.get(num);
          return {
            id: num,
            handle: other.handle,
            level: other.level,
            sharedTechniques: shared,
            links: other.links
          };
        })
    );
  }

  const totals = { automated: 0, assisted: 0, "manual-only": 0 };
  const byLevel = {};
  for (const entry of byCriterion.values()) {
    totals[entry.coverage] += 1;
    byLevel[entry.level] ||= { automated: 0, assisted: 0, "manual-only": 0, total: 0 };
    byLevel[entry.level][entry.coverage] += 1;
    byLevel[entry.level].total += 1;
  }

  const total = byCriterion.size;

  cache = {
    byCriterion,
    related,
    summary: {
      source: "wcag-translator",
      total,
      ...totals,
      automatedPercent: Math.round((totals.automated / total) * 1000) / 10,
      byLevel,
      note:
        "Derived by intersecting the indexed WCAG criteria with the WCAG tags automated checkers publish for their own rules. It describes what tooling claims to look at; what a page does is a separate question."
    }
  };

  return cache;
}

export const coverageFor = (num) => build().byCriterion.get(num) || null;
export const relatedTo = (num) => build().related.get(num) || [];
export const coverageSummary = () => build().summary;
export const allCoverage = () => [...build().byCriterion.values()];
