// Ingests a whole scanner report rather than one rule id at a time.
//
// This is what an actual CI step has on hand: `axe-cli --save results.json`,
// a Lighthouse LHR, or Pa11y's JSON output. Making a caller pick the rule ids
// out of that by hand is the sort of friction that stops an integration from
// being written at all.

import { translateRules } from "./rules.js";

/**
 * Detects which scanner produced a report and pulls out the failing rule ids
 * with the node counts attached, so the rollup can be weighted by how much of
 * the page each criterion actually affects.
 */
export function extractFindings(report) {
  if (Array.isArray(report)) {
    // Pa11y JSON is a bare array of issues.
    if (report.length && typeof report[0]?.code === "string") {
      return { format: "pa11y", findings: countBy(report.map((issue) => issue.code)) };
    }
    // A plain array of rule ids is a reasonable thing for someone to send.
    if (report.every((entry) => typeof entry === "string")) {
      return { format: "rule-ids", findings: countBy(report) };
    }
  }

  if (report && typeof report === "object") {
    // Pa11y wraps its issues when run with --reporter json in some versions.
    if (Array.isArray(report.issues)) {
      return { format: "pa11y", findings: countBy(report.issues.map((issue) => issue.code)) };
    }

    // axe-core results object, or the array a runner sometimes hands over.
    if (Array.isArray(report.violations)) {
      const findings = report.violations.map((violation) => ({
        rule: violation.id,
        occurrences: Array.isArray(violation.nodes) ? violation.nodes.length : 1,
        impact: violation.impact || null
      }));

      // `incomplete` is axe flagging something for a human. Reported separately
      // rather than folded in, since "needs review" and "failed" are different
      // answers and collapsing them overstates the result.
      const incomplete = Array.isArray(report.incomplete)
        ? report.incomplete.map((entry) => ({
            rule: entry.id,
            occurrences: Array.isArray(entry.nodes) ? entry.nodes.length : 1,
            impact: entry.impact || null
          }))
        : [];

      return { format: "axe", findings, incomplete, url: report.url || null };
    }

    // Lighthouse LHR.
    if (report.audits && typeof report.audits === "object") {
      const findings = [];
      for (const [id, audit] of Object.entries(report.audits)) {
        if (audit?.score === 0 && audit?.scoreDisplayMode !== "notApplicable") {
          findings.push({
            rule: id,
            occurrences: audit.details?.items?.length || 1,
            impact: null
          });
        }
      }
      return { format: "lighthouse", findings, url: report.finalUrl || report.requestedUrl || null };
    }
  }

  return { format: null, findings: [] };
}

function countBy(ids) {
  const counts = new Map();
  for (const id of ids) counts.set(id, (counts.get(id) || 0) + 1);
  return [...counts.entries()].map(([rule, occurrences]) => ({ rule, occurrences, impact: null }));
}

const IMPACT_ORDER = { critical: 0, serious: 1, moderate: 2, minor: 3 };

export function translateReport(report, { version = "2.2", level = null } = {}) {
  const { format, findings, incomplete = [], url } = extractFindings(report);

  if (!format) {
    return { recognised: false };
  }

  const occurrencesByRule = new Map(findings.map((f) => [f.rule, f]));
  const translated = translateRules(
    findings.map((f) => f.rule),
    { version, level }
  );

  // Weight each criterion by how many elements on the page drove it there.
  for (const result of translated.translation.results) {
    let occurrences = 0;
    let impacts = [];
    for (const rule of result.match.rules) {
      const finding = occurrencesByRule.get(rule.id);
      if (!finding) continue;
      occurrences += finding.occurrences;
      if (finding.impact) impacts.push(finding.impact);
    }
    result.match.occurrences = occurrences;
    result.match.impact =
      impacts.sort((a, b) => (IMPACT_ORDER[a] ?? 9) - (IMPACT_ORDER[b] ?? 9))[0] || null;
  }

  translated.translation.results.sort(
    (a, b) =>
      (IMPACT_ORDER[a.match.impact] ?? 9) - (IMPACT_ORDER[b.match.impact] ?? 9) ||
      b.match.occurrences - a.match.occurrences ||
      a.criterion.id.localeCompare(b.criterion.id, undefined, { numeric: true })
  );

  const totalOccurrences = findings.reduce((sum, f) => sum + f.occurrences, 0);

  return {
    recognised: true,
    report: {
      source: "wcag-translator",
      format,
      url,
      findings: findings.length,
      occurrences: totalOccurrences,
      needsReview: incomplete.map((entry) => entry.rule)
    },
    ...translated,
    translation: {
      ...translated.translation,
      summary:
        `${findings.length} failing ${findings.length === 1 ? "check" : "checks"} ` +
        `across ${totalOccurrences} ${totalOccurrences === 1 ? "element" : "elements"} ` +
        `map to ${translated.translation.results.length} success ` +
        `${translated.translation.results.length === 1 ? "criterion" : "criteria"}.` +
        (incomplete.length
          ? ` ${incomplete.length} further ${incomplete.length === 1 ? "check needs" : "checks need"} human review.`
          : "")
    },
    caveat:
      "This groups what the scanner found by criterion, so you know which parts of WCAG the run actually touched. Conformance remains a human judgement over the whole standard. See /v1/coverage for how much of it automation reaches."
  };
}
