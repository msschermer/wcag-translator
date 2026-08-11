import express from "express";

import { health } from "./health.js";
import { meta } from "./meta.js";
import { stats } from "./stats.js";
import { search } from "./search.js";
import { openapi } from "./openapi.js";
import { listCriteria, getCriterion } from "./criteria.js";
import { listTechniques, getTechnique } from "./techniques.js";
import { listGlossary, getGlossaryTerm } from "./glossary.js";
import { translateGet, translatePost } from "./translate.js";
import { translateRule, translateRuleGet, listRules, getRule } from "./rules.js";
import { ingestReport } from "./report.js";
import { coverage, criterionCoverage, criterionRelated } from "./coverage.js";
import { dataCache } from "../middleware/cache.js";

export function apiRouter() {
  const router = express.Router();

  router.get("/health", health);
  router.get("/meta", meta);
  router.get("/stats", stats);
  router.get("/openapi.yaml", openapi);

  router.get("/translate", translateGet);
  router.post("/translate", translatePost);
  router.get("/search", search);

  // Same result shape as /v1/translate, sourced from an automated checker's
  // rule id instead of a sentence.
  router.post("/translate/rule", translateRule);
  router.get("/translate/rule", translateRuleGet);

  // A whole scanner report, rather than rule ids picked out of it by hand.
  router.post("/report", ingestReport);

  // Static reference data: safe to cache and revalidate.
  const cache = dataCache({ maxAge: 3600 });
  router.get("/criteria", cache, listCriteria);
  router.get("/criteria/:id", cache, getCriterion);
  router.get("/criteria/:id/coverage", cache, criterionCoverage);
  router.get("/criteria/:id/related", cache, criterionRelated);
  router.get("/techniques", cache, listTechniques);
  router.get("/techniques/:id", cache, getTechnique);
  router.get("/glossary", cache, listGlossary);
  router.get("/glossary/:term", cache, getGlossaryTerm);
  router.get("/rules", cache, listRules);
  router.get("/rules/:id", cache, getRule);
  router.get("/coverage", cache, coverage);

  return router;
}
