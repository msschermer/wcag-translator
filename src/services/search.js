import { loadData } from "../data/loader.js";
import { rank, relevance } from "./ranking.js";
import { tokenize } from "../utils/normalize.js";

function filterCriterion(criterion, { level, version }) {
  if (level && criterion.level !== level) return false;
  if (version && !criterion.versions.includes(version)) return false;
  return true;
}

export function searchCriteria(query, { limit = 10, level = null, version = null } = {}) {
  const data = loadData();
  const tokens = tokenize(query);

  // Over-fetch then filter, otherwise a level filter can empty a page.
  return rank(tokens, data.search, "criterion", { limit: limit * 4 })
    .map((hit) => ({ hit, criterion: data.byNum.get(hit.ref) }))
    .filter(({ criterion }) => criterion && filterCriterion(criterion, { level, version }))
    .slice(0, limit)
    .map(({ hit, criterion }) => ({
      type: "criterion",
      id: criterion.num,
      handle: criterion.handle,
      level: criterion.level,
      versions: criterion.versions,
      guideline: criterion.guideline,
      principle: criterion.principle,
      links: criterion.links,
      relevance: relevance(hit.score),
      matchedTerms: hit.matched
    }));
}

export function searchTechniques(query, { limit = 10 } = {}) {
  const data = loadData();
  return rank(tokenize(query), data.search, "technique", { limit })
    .map((hit) => ({ hit, technique: data.techniqueById.get(hit.ref.toUpperCase()) }))
    .filter(({ technique }) => technique)
    .map(({ hit, technique }) => ({
      type: "technique",
      id: technique.id,
      title: technique.title,
      technology: technique.technology,
      categories: technique.categories,
      criteria: technique.criteria,
      url: technique.url,
      relevance: relevance(hit.score)
    }));
}

export function searchGlossary(query, { limit = 10 } = {}) {
  const data = loadData();
  return rank(tokenize(query), data.search, "glossary", { limit })
    .map((hit) => ({ hit, entry: data.glossaryById.get(hit.ref) }))
    .filter(({ entry }) => entry)
    .map(({ hit, entry }) => ({
      type: "glossary",
      id: entry.id,
      name: entry.name,
      definition: entry.definition,
      text: entry.derived.text,
      relevance: relevance(hit.score)
    }));
}

export function combinedSearch(query, options = {}) {
  return {
    query,
    tokens: tokenize(query),
    criteria: searchCriteria(query, options),
    techniques: searchTechniques(query, options),
    glossary: searchGlossary(query, options)
  };
}
