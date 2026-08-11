import { coverageSummary, allCoverage, coverageFor, relatedTo } from "../services/coverage.js";
import { loadData } from "../data/loader.js";
import { canonicalCriterionId } from "../utils/normalize.js";
import { errorResponse, ok } from "../utils/response.js";

export function coverage(req, res) {
  const filter = req.query.coverage ? String(req.query.coverage).toLowerCase() : null;
  const level = req.query.level ? String(req.query.level).toUpperCase() : null;

  let criteria = allCoverage();
  if (filter) criteria = criteria.filter((entry) => entry.coverage === filter);
  if (level) criteria = criteria.filter((entry) => entry.level === level);

  return ok(res, { summary: coverageSummary(), criteria }, { attribution: false });
}

function resolve(req, res) {
  const raw = canonicalCriterionId(req.params.id);
  const data = loadData();
  const criterion = data.byNum.get(raw) || data.bySlug.get(raw.toLowerCase());

  if (!criterion) {
    errorResponse(res, 404, `No WCAG success criterion matches "${req.params.id}".`, {
      hint: "Use the criterion number (1.4.3) or its slug (contrast-minimum)."
    });
    return null;
  }
  return criterion;
}

export function criterionCoverage(req, res) {
  const criterion = resolve(req, res);
  if (!criterion) return undefined;
  return ok(res, coverageFor(criterion.num), { attribution: false });
}

export function criterionRelated(req, res) {
  const criterion = resolve(req, res);
  if (!criterion) return undefined;

  return ok(res, {
    criterion: { id: criterion.num, handle: criterion.handle },
    related: relatedTo(criterion.num),
    basis: {
      source: "wcag-translator",
      method:
        "Criteria ranked by how many W3C techniques they share with this one. Techniques are W3C material; the ranking is not."
    }
  });
}
