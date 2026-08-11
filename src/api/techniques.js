import { loadData } from "../data/loader.js";
import { errorResponse, ok } from "../utils/response.js";

export function listTechniques(req, res) {
  const data = loadData();
  const technology = req.query.technology ? String(req.query.technology).toLowerCase() : null;
  const category = req.query.category ? String(req.query.category).toLowerCase() : null;
  const criterion = req.query.criterion ? String(req.query.criterion) : null;
  const limit = Math.min(Math.max(Number(req.query.limit) || 50, 1), 100);
  const offset = Math.max(Number(req.query.offset) || 0, 0);

  const filtered = data.techniques.filter((technique) => {
    if (technology && technique.technology !== technology) return false;
    if (category && !technique.categories.includes(category)) return false;
    if (criterion && !technique.criteria.includes(criterion)) return false;
    return true;
  });

  return ok(res, filtered.slice(offset, offset + limit), {
    meta: { total: filtered.length, limit, offset }
  });
}

export function getTechnique(req, res) {
  const id = String(req.params.id).trim().toUpperCase();
  const technique = loadData().techniqueById.get(id);

  if (!technique) {
    return errorResponse(res, 404, `Technique "${req.params.id}" was not found.`, {
      hint: "Technique ids look like G18, H37, ARIA6, SCR34, F65."
    });
  }

  return ok(res, technique);
}
