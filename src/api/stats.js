import { loadData } from "../data/loader.js";
import { ok } from "../utils/response.js";
import { coverageSummary } from "../services/coverage.js";
import { ruleIndex } from "../services/rules.js";

export function stats(req, res) {
  const data = loadData();

  const byLevel = {};
  const byVersion = {};
  for (const criterion of data.criteria) {
    byLevel[criterion.level] = (byLevel[criterion.level] || 0) + 1;
    for (const version of criterion.versions) {
      byVersion[version] = (byVersion[version] || 0) + 1;
    }
  }

  const byTechnology = {};
  for (const technique of data.techniques) {
    const key = technique.technology || "unclassified";
    byTechnology[key] = (byTechnology[key] || 0) + 1;
  }

  const rules = ruleIndex();

  return ok(res, {
    dataset: data.index,
    coverage: coverageSummary(),
    checkerRules: {
      total: rules.counts.total,
      unmapped: rules.counts.unmapped,
      engines: rules.engines
    },
    criteria: { total: data.criteria.length, byLevel, byVersion },
    techniques: { total: data.techniques.length, byTechnology },
    glossary: { total: data.glossary.length },
    developerVocabulary: (() => {
      // Intersected with the indexed criteria, not counted raw. A phrase
      // pointing at a criterion this build does not contain reaches nothing,
      // and counting it produced percentages over 100 against a partial data set.
      const referenced = new Set(data.vocabulary.terms.flatMap((t) => t.criteria));
      const reached = new Set([...referenced].filter((num) => data.byNum.has(num)));
      return {
        source: "wcag-translator",
        phrases: data.vocabulary.terms.length,
        referencedCriteria: referenced.size,
        mappedCriteria: reached.size,
        // How much of WCAG a plain-language question can land on directly.
        // The remainder is reachable through search, just at lower confidence.
        reachPercent: Math.round((reached.size / data.criteria.length) * 1000) / 10
      };
    })()
  });
}
