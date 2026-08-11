import fs from "node:fs";
import path from "node:path";

import { loadData, dataDirectory } from "../data/loader.js";
import { buildResult } from "./translator.js";

let ruleData = null;

function rules() {
  if (ruleData) return ruleData;

  const filePath = path.join(dataDirectory, "rules.json");
  if (!fs.existsSync(filePath)) {
    throw new Error(`Rule map is missing: ${filePath}. Run: npm run build:rules`);
  }

  const parsed = JSON.parse(fs.readFileSync(filePath, "utf8"));
  ruleData = {
    ...parsed,
    byId: new Map(parsed.rules.map((rule) => [rule.id.toLowerCase(), rule]))
  };
  return ruleData;
}

export function ruleIndex() {
  return rules();
}

/**
 * HTML_CodeSniffer codes, as emitted by Pa11y, already contain the criterion:
 *
 *   WCAG2AA.Principle1.Guideline1_4.1_4_3.G18.Fail
 *                                  ^^^^^
 *
 * No lookup table can go stale here, so it is parsed rather than mapped. The
 * trailing technique id is returned too when present.
 */
function parseCodeSniffer(raw) {
  const match = /Guideline\d_\d\.(\d+)_(\d+)_(\d+)(?:\.([A-Z]+\d+))?/.exec(raw);
  if (!match) return null;
  return {
    criteria: [`${match[1]}.${match[2]}.${match[3]}`],
    technique: match[4] || null
  };
}

function normalizeId(raw) {
  return String(raw).trim().toLowerCase();
}

/**
 * Resolves one checker rule id to WCAG criteria.
 *
 * Order matters. The HTML_CodeSniffer pattern is checked first because those
 * codes are self-describing and would never appear in the axe table anyway.
 */
export function resolveRule(raw, { engine = "auto" } = {}) {
  const input = String(raw).trim();

  if (engine === "auto" || engine === "pa11y" || engine === "htmlcs") {
    const parsed = parseCodeSniffer(input);
    if (parsed) {
      return {
        rule: {
          id: input,
          engine: "pa11y",
          source: "wcag-translator",
          help: "Parsed from the HTML_CodeSniffer code, which encodes the criterion directly.",
          helpUrl: null,
          criteria: parsed.criteria,
          criteriaSource: "wcag-translator",
          technique: parsed.technique
        },
        resolution: "parsed"
      };
    }
  }

  const found = rules().byId.get(normalizeId(input));
  if (found && (engine === "auto" || engine === found.engine || engine === "lighthouse")) {
    return { rule: found, resolution: "mapped" };
  }

  return { rule: null, resolution: "unknown", suggestions: suggest(input) };
}

// Suggestions for a rule id that did not resolve. A wrong id is usually a typo,
// a spelling variant (colour/color), or an id that moved between engine
// versions, so prefix, substring and edit distance are all worth checking.
// 115 candidates makes the cost irrelevant.
function editDistance(a, b, cap) {
  if (Math.abs(a.length - b.length) > cap) return cap + 1;

  let previous = Array.from({ length: b.length + 1 }, (_, i) => i);

  for (let i = 1; i <= a.length; i += 1) {
    const current = [i];
    let rowMin = i;
    for (let j = 1; j <= b.length; j += 1) {
      current[j] = Math.min(
        previous[j] + 1,
        current[j - 1] + 1,
        previous[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)
      );
      if (current[j] < rowMin) rowMin = current[j];
    }
    if (rowMin > cap) return cap + 1;
    previous = current;
  }

  return previous[b.length];
}

function suggest(input) {
  const needle = normalizeId(input).replace(/[^a-z0-9]/g, "");
  if (needle.length < 3) return [];

  const cap = needle.length <= 6 ? 2 : 3;

  return rules()
    .rules.map((rule) => {
      const flat = rule.id.replace(/[^a-z0-9]/g, "");
      if (flat === needle) return { id: rule.id, score: 100 };
      if (flat.startsWith(needle) || needle.startsWith(flat)) return { id: rule.id, score: 60 };
      if (flat.includes(needle) || needle.includes(flat)) return { id: rule.id, score: 40 };
      const distance = editDistance(needle, flat, cap);
      return distance <= cap ? { id: rule.id, score: 30 - distance } : null;
    })
    .filter(Boolean)
    .sort((a, b) => b.score - a.score)
    .slice(0, 3)
    .map((hit) => hit.id);
}

export function translateRules(ids, { version = "2.2", level = null } = {}) {
  const data = loadData();

  const perRule = [];
  const rollup = new Map();

  for (const id of ids) {
    const { rule, resolution, suggestions } = resolveRule(id);

    if (!rule) {
      perRule.push({
        rule: id,
        resolved: false,
        reason: "No checker rule matches that id.",
        suggestions
      });
      continue;
    }

    if (!rule.criteria.length) {
      perRule.push({
        rule: rule.id,
        engine: rule.engine,
        resolved: true,
        wcagMapped: false,
        help: rule.help,
        helpUrl: rule.helpUrl,
        criteria: [],
        note:
          "The engine classifies this as best practice or experimental, so it carries no WCAG mapping. Worth fixing on its own merits; treat any WCAG link as your own call."
      });
      continue;
    }

    const resolved = [];
    const filteredOut = [];

    for (const num of rule.criteria) {
      const criterion = data.byNum.get(num);
      if (!criterion) {
        // The engine references a criterion the indexed WCAG data does not
        // contain. Surfaced rather than swallowed.
        filteredOut.push({ criterion: num, reason: "not present in the indexed WCAG data" });
        continue;
      }
      if (level && criterion.level !== level) {
        filteredOut.push({ criterion: num, reason: `level ${criterion.level}, filtered to ${level}` });
        continue;
      }
      if (version && !criterion.versions.includes(version)) {
        filteredOut.push({ criterion: num, reason: `not in WCAG ${version}` });
        continue;
      }

      resolved.push(num);

      if (!rollup.has(num)) {
        rollup.set(
          num,
          buildResult(criterion, {
            source: "wcag-translator",
            confidence: "high",
            basis: "rule-mapping",
            rules: [],
            explanation: ""
          })
        );
      }
      rollup.get(num).match.rules.push({
        id: rule.id,
        engine: rule.engine,
        mappingSource: rule.criteriaSource || rule.source,
        resolution
      });
    }

    perRule.push({
      rule: rule.id,
      engine: rule.engine,
      resolved: true,
      wcagMapped: true,
      resolution,
      help: rule.help,
      helpUrl: rule.helpUrl,
      mappingSource: rule.criteriaSource || rule.source,
      criteria: resolved,
      excluded: filteredOut
    });
  }

  for (const result of rollup.values()) {
    const from = result.match.rules;
    const engines = [...new Set(from.map((r) => r.engine))];
    result.match.explanation =
      `${from.length === 1 ? "Rule" : "Rules"} ${from.map((r) => r.id).join(", ")} ` +
      `(${engines.join(", ")}) ${from.length === 1 ? "maps" : "map"} to ${result.criterion.id} ` +
      `${result.criterion.handle}. The mapping comes from ` +
      `${from.every((r) => r.mappingSource === "axe-core") ? "the engine's own WCAG tags" : "this service"}, ` +
      `and describes what the check looks at.`;
  }

  const results = [...rollup.values()].sort((a, b) =>
    a.criterion.id.localeCompare(b.criterion.id, undefined, { numeric: true })
  );

  const unresolved = perRule.filter((r) => !r.resolved).length;
  const unmapped = perRule.filter((r) => r.resolved && r.wcagMapped === false).length;

  return {
    version,
    level: level || "any",
    input: { rules: ids, count: ids.length },
    translation: {
      source: "wcag-translator",
      summary:
        `${ids.length} rule ${ids.length === 1 ? "id" : "ids"} in, ` +
        `${results.length} distinct success ${results.length === 1 ? "criterion" : "criteria"} out` +
        (unresolved ? `, ${unresolved} unrecognised` : "") +
        (unmapped ? `, ${unmapped} with no WCAG mapping` : "") +
        ".",
      results
    },
    rules: perRule,
    caveat:
      "These mappings tell you what each check is about. Whether the criterion is met stays a human judgement, and /v1/coverage shows how much of WCAG automation reaches at all."
  };
}
