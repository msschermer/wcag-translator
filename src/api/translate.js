import { translate } from "../services/translator.js";
import { config } from "../config/config.js";
import { errorResponse, ok } from "../utils/response.js";

const LEVELS = new Set(["A", "AA", "AAA"]);

function validate({ query, version, level }) {
  if (typeof query !== "string") return "query must be a string.";
  if (!query.trim()) return "query is required.";
  if (query.length > config.maxQueryLength) {
    return `query exceeds the ${config.maxQueryLength} character limit.`;
  }
  if (version && !["2.2", "2.1", "2.0"].includes(String(version))) {
    return `version must be one of 2.2, 2.1, 2.0.`;
  }
  if (level && !LEVELS.has(String(level).toUpperCase())) {
    return "level must be one of A, AA, AAA.";
  }
  return null;
}

function clampResults(value) {
  return Math.min(Math.max(Number(value) || 5, 1), 10);
}

function run(res, { query, version, level, maxResults }) {
  const problem = validate({ query, version, level });
  if (problem) return errorResponse(res, 400, problem);

  return ok(
    res,
    translate(query, {
      version: version ? String(version) : "2.2",
      level: level ? String(level).toUpperCase() : null,
      maxResults: clampResults(maxResults)
    })
  );
}

export function translateGet(req, res) {
  return run(res, {
    query: String(req.query.q ?? ""),
    version: req.query.version,
    level: req.query.level,
    maxResults: req.query.limit
  });
}

export function translatePost(req, res) {
  const body = req.body || {};
  return run(res, {
    query: body.query,
    version: body.version,
    level: body.level,
    maxResults: body.maxResults
  });
}
