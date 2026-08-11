import { loadData } from "../data/loader.js";
import { canonicalCriterionId } from "../utils/normalize.js";
import { errorResponse, ok } from "../utils/response.js";

export function listCriteria(req, res) {
  const data = loadData();
  const level = req.query.level ? String(req.query.level).toUpperCase() : null;
  const version = req.query.version ? String(req.query.version) : null;
  const limit = Math.min(Math.max(Number(req.query.limit) || 50, 1), 100);
  const offset = Math.max(Number(req.query.offset) || 0, 0);

  const filtered = data.criteria.filter((criterion) => {
    if (level && criterion.level !== level) return false;
    if (version && !criterion.versions.includes(version)) return false;
    return true;
  });

  return ok(
    res,
    filtered.slice(offset, offset + limit).map((criterion) => ({
      id: criterion.num,
      slug: criterion.id,
      handle: criterion.handle,
      level: criterion.level,
      versions: criterion.versions,
      guideline: criterion.guideline,
      principle: criterion.principle,
      links: criterion.links
    })),
    { meta: { total: filtered.length, limit, offset } }
  );
}

export function getCriterion(req, res) {
  const raw = canonicalCriterionId(req.params.id);
  const data = loadData();
  const criterion = data.byNum.get(raw) || data.bySlug.get(raw.toLowerCase());

  if (!criterion) {
    return errorResponse(res, 404, `No WCAG success criterion matches "${req.params.id}".`, {
      hint: "Use the criterion number (1.4.3) or its slug (contrast-minimum)."
    });
  }

  return ok(res, criterion);
}
