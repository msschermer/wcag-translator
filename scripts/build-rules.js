// Generates the automated-checker rule map served by /v1/rules and
// /v1/translate/rule.
//
// The axe-core half is derived from axe-core itself rather than typed out by
// hand. Every axe rule carries WCAG tags in the form `wcag143`, so the mapping
// is a fact the engine already publishes; maintaining a parallel copy would
// just be a copy that drifts.
//
// Usage:
//   node scripts/build-rules.js
//   node scripts/build-rules.js --out data/fixtures/generated

import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function arg(name, fallback) {
  const index = process.argv.indexOf(`--${name}`);
  return index > -1 && process.argv[index + 1] ? process.argv[index + 1] : fallback;
}

const outDir = path.resolve(ROOT, arg("out", "data/generated"));

/**
 * "wcag143" -> "1.4.3", "wcag2410" -> "2.4.10", "wcag1413" -> "1.4.13".
 *
 * Unambiguous because WCAG principles are 1-4 and every guideline number is a
 * single digit, so the first two digits are always principle and guideline and
 * everything after them is the criterion index.
 */
function criterionFromTag(tag) {
  const match = /^wcag(\d{3,4})$/.exec(tag);
  if (!match) return null;
  const digits = match[1];
  return `${digits[0]}.${digits[1]}.${digits.slice(2)}`;
}

const LEVEL_TAG = /^wcag2\d?(a|aa|aaa)$/;

async function main() {
  await fs.mkdir(outDir, { recursive: true });

  const axe = require("axe-core");
  const axeRules = axe.getRules();

  const rules = [];

  for (const rule of axeRules) {
    const criteria = [...new Set(rule.tags.map(criterionFromTag).filter(Boolean))].sort();
    const levelTag = rule.tags.find((t) => LEVEL_TAG.test(t));

    rules.push({
      id: rule.ruleId,
      engine: "axe",
      source: "axe-core",
      help: rule.help,
      description: rule.description,
      helpUrl: rule.helpUrl,
      criteria,
      criteriaSource: "axe-core",
      // A rule with no WCAG tag is a best-practice or experimental check. It is
      // kept and returned, but flagged, because "axe fired and it maps to
      // nothing in WCAG" is a genuinely useful answer rather than a 404.
      wcagMapped: criteria.length > 0,
      conformanceTag: levelTag || null,
      tags: rule.tags.filter((t) => !t.startsWith("cat."))
    });
  }

  const aliases = JSON.parse(
    await fs.readFile(path.join(ROOT, "data", "lighthouse-aliases.json"), "utf8")
  );

  const byId = new Map(rules.map((r) => [r.id, r]));
  for (const alias of aliases.aliases) {
    const existing = byId.get(alias.id);
    if (existing) {
      // axe already has a rule by this name. If axe carries no WCAG tag (a
      // best-practice check), the locally maintained mapping supplements it,
      // clearly marked as ours rather than as engine metadata.
      if (!existing.wcagMapped) {
        existing.criteria = alias.criteria;
        existing.wcagMapped = true;
        existing.criteriaSource = "wcag-translator";
        existing.criteriaNote =
          "axe-core classifies this as best practice with no WCAG tag. The mapping is supplied by this service.";
      }
      continue;
    }
    rules.push({
      id: alias.id,
      engine: "lighthouse",
      source: "wcag-translator",
      help: alias.note,
      description: alias.note,
      helpUrl: `https://developer.chrome.com/docs/lighthouse/accessibility/${alias.id}`,
      criteria: alias.criteria,
      wcagMapped: true,
      criteriaSource: "wcag-translator",
      conformanceTag: null,
      tags: ["lighthouse", "manual"]
    });
  }

  rules.sort((a, b) => a.id.localeCompare(b.id));

  const unmapped = rules.filter((r) => !r.wcagMapped).length;

  const payload = {
    generatedAt: new Date().toISOString(),
    engines: {
      axe: {
        name: "axe-core",
        version: axe.version,
        source: "https://github.com/dequelabs/axe-core",
        license: "MPL-2.0",
        rules: rules.filter((r) => r.engine === "axe").length
      },
      lighthouse: {
        name: "Lighthouse",
        note:
          "Most Lighthouse accessibility audits wrap axe and resolve by the same id. Only the manual and Lighthouse-specific audits are listed separately.",
        source: "wcag-translator",
        rules: rules.filter((r) => r.engine === "lighthouse").length
      },
      pa11y: {
        name: "Pa11y / HTML_CodeSniffer",
        note:
          "No table needed. HTML_CodeSniffer codes embed the criterion, so they are parsed at request time.",
        source: "wcag-translator"
      }
    },
    counts: { total: rules.length, unmapped },
    rules
  };

  if (rules.filter((r) => r.engine === "axe").length < 50) {
    throw new Error("Extracted fewer than 50 axe rules. axe-core's metadata shape has changed.");
  }

  await fs.writeFile(path.join(outDir, "rules.json"), JSON.stringify(payload), "utf8");

  console.log(
    `Generated ${payload.counts.total} checker rules ` +
      `(axe-core ${axe.version}: ${payload.engines.axe.rules}, lighthouse-only: ${payload.engines.lighthouse.rules}, ` +
      `${unmapped} with no WCAG mapping) -> ${outDir}`
  );
}

main().catch((error) => {
  console.error("\nRule map build failed.\n");
  console.error(error.message);
  process.exit(1);
});
