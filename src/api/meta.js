import { loadData } from "../data/loader.js";
import { config } from "../config/config.js";
import { ok } from "../utils/response.js";

export function meta(req, res) {
  const { index } = loadData();

  return ok(res, {
    name: config.appName,
    version: config.version,
    description:
      "Translates plain engineering language into WCAG success criteria, techniques and terminology.",
    scope:
      "Maps language, checker rule ids and scan reports onto WCAG guidance. Everything runs against the indexed W3C data on this server; evaluating a page and judging conformance stay with you.",
    inputs: [
      "plain developer language",
      "axe-core rule ids",
      "Lighthouse accessibility audit ids",
      "Pa11y / HTML_CodeSniffer codes",
      "whole axe-core, Lighthouse or Pa11y reports"
    ],
    supportedVersions: index.versions,
    defaultVersion: index.defaultVersion,
    endpoints: {
      translate: ["GET /v1/translate?q=", "POST /v1/translate"],
      ruleIngest: ["POST /v1/translate/rule", "GET /v1/translate/rule?rule=", "GET /v1/rules", "GET /v1/rules/:id"],
      reportIngest: ["POST /v1/report"],
      coverage: ["GET /v1/coverage", "GET /v1/criteria/:id/coverage", "GET /v1/criteria/:id/related"],
      search: ["GET /v1/search?q="],
      criteria: ["GET /v1/criteria", "GET /v1/criteria/:id"],
      techniques: ["GET /v1/techniques", "GET /v1/techniques/:id"],
      glossary: ["GET /v1/glossary", "GET /v1/glossary/:term"],
      service: ["GET /v1/health", "GET /v1/meta", "GET /v1/stats", "GET /v1/openapi.yaml"]
    },
    limits: {
      publicRequestsPerMinute: config.publicRateLimit,
      authenticatedRequestsPerMinute: config.apiRateLimit,
      maxQueryLength: config.maxQueryLength,
      maxBodyBytes: config.maxBodyBytes
    },
    authentication: {
      required: false,
      headers: ["X-API-Key: <key>", "Authorization: Bearer <key>"],
      effect: "Raises the rate limit. No endpoint is gated behind a key."
    }
  });
}
