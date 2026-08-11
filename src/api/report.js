import { translateReport } from "../services/report.js";
import { errorResponse, ok } from "../utils/response.js";

const LEVELS = new Set(["A", "AA", "AAA"]);

export function ingestReport(req, res) {
  const body = req.body;

  if (!body || (typeof body !== "object" && !Array.isArray(body))) {
    return errorResponse(res, 400, "Send a scanner report as the request body.");
  }

  const options = Array.isArray(body) ? {} : body;
  if (options.level && !LEVELS.has(String(options.level).toUpperCase())) {
    return errorResponse(res, 400, "level must be one of A, AA, AAA.");
  }

  // Accept either the raw scanner output, or a wrapper carrying it alongside
  // filters. Both are things a caller reasonably reaches for.
  const payload = options.report ?? body;

  const result = translateReport(payload, {
    version: options.version ? String(options.version) : "2.2",
    level: options.level ? String(options.level).toUpperCase() : null
  });

  if (!result.recognised) {
    return errorResponse(res, 400, "Could not recognise that report format.", {
      supported: [
        "axe-core results object with a `violations` array",
        "Lighthouse LHR with an `audits` object",
        "Pa11y JSON array of issues with `code` fields",
        "a plain array of rule id strings"
      ],
      hint: "Wrap it as { \"report\": <scanner output>, \"level\": \"AA\" } if you need filters."
    });
  }

  const { recognised, ...data } = result;
  return ok(res, data);
}
