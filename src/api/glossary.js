import { loadData } from "../data/loader.js";
import { errorResponse, ok } from "../utils/response.js";

export function listGlossary(req, res) {
  const data = loadData();
  const limit = Math.min(Math.max(Number(req.query.limit) || 50, 1), 200);
  const offset = Math.max(Number(req.query.offset) || 0, 0);

  return ok(res, data.glossary.slice(offset, offset + limit), {
    meta: { total: data.glossary.length, limit, offset }
  });
}

export function getGlossaryTerm(req, res) {
  const data = loadData();
  const raw = String(req.params.term).trim();
  const key = raw.toLowerCase().replace(/[-_]+/g, " ");

  const entry =
    data.glossaryByName.get(key) ||
    data.glossaryById.get(raw) ||
    data.glossaryById.get(`dfn-${raw.toLowerCase().replace(/\s+/g, "-")}`);

  if (!entry) {
    return errorResponse(res, 404, `Glossary term "${raw}" was not found.`, {
      hint: "Try the term as written in WCAG, for example \"accessible name\" or \"contrast ratio\". GET /v1/glossary lists everything."
    });
  }

  return ok(res, entry);
}
