import { combinedSearch } from "../services/search.js";
import { config } from "../config/config.js";
import { errorResponse, ok } from "../utils/response.js";

export function search(req, res) {
  const query = String(req.query.q || "").trim();

  if (!query) return errorResponse(res, 400, "Query parameter q is required.");
  if (query.length > config.maxQueryLength) {
    return errorResponse(res, 400, `Query exceeds the ${config.maxQueryLength} character limit.`);
  }

  const limit = Math.min(Math.max(Number(req.query.limit) || 10, 1), 25);
  const level = req.query.level ? String(req.query.level).toUpperCase() : null;
  const version = req.query.version ? String(req.query.version) : null;

  return ok(res, combinedSearch(query, { limit, level, version }));
}
