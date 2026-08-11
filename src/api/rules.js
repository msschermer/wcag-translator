import { translateRules, resolveRule, ruleIndex } from "../services/rules.js";
import { errorResponse, ok } from "../utils/response.js";

const MAX_BATCH = 100;
const LEVELS = new Set(["A", "AA", "AAA"]);

function collectIds(body) {
  if (Array.isArray(body.rules)) return body.rules;
  if (typeof body.rule === "string") return [body.rule];
  if (Array.isArray(body.rule)) return body.rule;
  return null;
}

export function translateRule(req, res) {
  const body = req.body || {};
  const ids = collectIds(body);

  if (!ids || !ids.length) {
    return errorResponse(res, 400, "Provide `rule` (a string) or `rules` (an array of strings).", {
      example: { rules: ["color-contrast", "button-name"] }
    });
  }
  if (ids.length > MAX_BATCH) {
    return errorResponse(res, 400, `At most ${MAX_BATCH} rule ids per request.`, {
      received: ids.length
    });
  }
  if (ids.some((id) => typeof id !== "string" || !id.trim() || id.length > 200)) {
    return errorResponse(res, 400, "Every rule id must be a non-empty string under 200 characters.");
  }
  if (body.level && !LEVELS.has(String(body.level).toUpperCase())) {
    return errorResponse(res, 400, "level must be one of A, AA, AAA.");
  }
  if (body.version && !["2.2", "2.1", "2.0"].includes(String(body.version))) {
    return errorResponse(res, 400, "version must be one of 2.2, 2.1, 2.0.");
  }

  return ok(
    res,
    translateRules(ids, {
      version: body.version ? String(body.version) : "2.2",
      level: body.level ? String(body.level).toUpperCase() : null
    })
  );
}

export function translateRuleGet(req, res) {
  const raw = String(req.query.rule || req.query.q || "").trim();
  if (!raw) return errorResponse(res, 400, "Query parameter `rule` is required.");

  const ids = raw.split(",").map((id) => id.trim()).filter(Boolean);
  return translateRule(
    { ...req, body: { rules: ids, version: req.query.version, level: req.query.level } },
    res
  );
}

export function listRules(req, res) {
  const index = ruleIndex();
  const engine = req.query.engine ? String(req.query.engine).toLowerCase() : null;
  const criterion = req.query.criterion ? String(req.query.criterion) : null;
  const mapped = req.query.mapped;
  const limit = Math.min(Math.max(Number(req.query.limit) || 50, 1), 200);
  const offset = Math.max(Number(req.query.offset) || 0, 0);

  const filtered = index.rules.filter((rule) => {
    if (engine && rule.engine !== engine) return false;
    if (criterion && !rule.criteria.includes(criterion)) return false;
    if (mapped === "true" && !rule.wcagMapped) return false;
    if (mapped === "false" && rule.wcagMapped) return false;
    return true;
  });

  return ok(res, filtered.slice(offset, offset + limit), {
    attribution: false,
    meta: {
      total: filtered.length,
      limit,
      offset,
      engines: index.engines,
      generatedAt: index.generatedAt
    }
  });
}

export function getRule(req, res) {
  const { rule, resolution, suggestions } = resolveRule(req.params.id);

  if (!rule) {
    return errorResponse(res, 404, `No checker rule matches "${req.params.id}".`, {
      suggestions,
      hint: "GET /v1/rules lists every id. Pa11y and HTML_CodeSniffer codes are parsed, not listed."
    });
  }

  return ok(res, { ...rule, resolution }, { attribution: false });
}
