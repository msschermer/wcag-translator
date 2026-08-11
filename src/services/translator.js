import { loadData } from "../data/loader.js";
import { searchCriteria, searchTechniques } from "./search.js";
import { relevance } from "./ranking.js";
import { normalizeText, stem, tokenize } from "../utils/normalize.js";

// Compares on stemmed word boundaries.
//
// Boundaries matter because `normalized.includes("name")` also fires on
// "filename", "namespace" and "surname" - that is how the old matcher decided
// "the filename is wrong" was an accessible name problem.
//
// Stemming matters because developers write "my form fields do not have
// labels" while the vocabulary stores "field" and "label", and an exact
// boundary match on the raw text misses every plural.
function stemSentence(text) {
  return ` ${normalizeText(text).split(/[\s.]+/).filter(Boolean).map(stem).join(" ")} `;
}

function containsPhrase(stemmedHaystack, needle) {
  return stemmedHaystack.includes(` ${stemSentence(needle).trim()} `);
}

function matchesAlternatives(haystack, alternatives) {
  return alternatives.split("|").some((option) => containsPhrase(haystack, option));
}

/**
 * A vocabulary phrase fires when either:
 *  - the whole phrase appears, or
 *  - every `requires` group is satisfied (each group is an OR list).
 *
 * The `requires` groups are what stop "the button colour is wrong" from
 * matching "button has no accessible name" just because both mention a button.
 */
export function matchVocabulary(query) {
  return vocabularyMatches(normalizeText(query));
}

function vocabularyMatches(normalizedQuery) {
  const { vocabulary } = loadData();
  const stemmed = stemSentence(normalizedQuery);
  const matches = [];

  for (const term of vocabulary.terms || []) {
    const phraseMatch = containsPhrase(stemmed, term.phrase);

    const groups = term.requires || [];
    const satisfied = groups.filter((group) => matchesAlternatives(stemmed, group));
    const allRequired = groups.length > 0 && satisfied.length === groups.length;

    const keywordHits = (term.keywords || []).filter((keyword) =>
      containsPhrase(stemmed, keyword)
    );

    if (!phraseMatch && !allRequired) continue;

    matches.push({
      source: "wcag-translator",
      phrase: term.phrase,
      criteria: term.criteria || [],
      matchType: phraseMatch ? "phrase" : "signals",
      matchedKeywords: keywordHits,
      // Exact phrase beats an inferred signal match, and more keyword support
      // inside a signal match nudges it up without ever reaching phrase level.
      weight: phraseMatch ? 1 : Math.min(0.9, 0.6 + keywordHits.length * 0.07)
    });
  }

  return matches.sort((a, b) => b.weight - a.weight);
}

function confidenceFor(item) {
  if (item.matchType === "phrase") return "high";
  if (item.matchType === "signals") return item.weight >= 0.75 ? "high" : "medium";
  return item.relevanceScore >= 0.55 ? "medium" : "low";
}

function explain(item, criterion) {
  if (item.matchType === "phrase") {
    return `The wording matches the known developer phrase "${item.phrase}", which this service maps to ${criterion.num} ${criterion.handle}.`;
  }
  if (item.matchType === "signals") {
    const list = item.matchedKeywords.slice(0, 4).join(", ");
    return `The description carries the signals this service associates with "${item.phrase}"${list ? ` (${list})` : ""}, which maps to ${criterion.num} ${criterion.handle}.`;
  }
  return `Matched against the text of ${criterion.num} ${criterion.handle} by full text relevance rather than a known developer phrase, so treat it as a lead rather than an answer.`;
}

// Shared with the rule ingest path so a rule-sourced result is byte-identical
// in shape to a language-sourced one. That is the whole point of the endpoint:
// a client can pipe either into the same renderer.
export function buildResult(criterion, match) {
  return {
    criterion: {
      source: "w3c",
      id: criterion.num,
      slug: criterion.id,
      handle: criterion.handle,
      requirement: criterion.requirement,
      level: criterion.level,
      versions: criterion.versions,
      guideline: criterion.guideline,
      principle: criterion.principle
    },
    match,
    techniques: criterion.techniques.slice(0, 8),
    links: criterion.links
  };
}

export function translate(query, { version = "2.2", level = null, maxResults = 5 } = {}) {
  const data = loadData();
  const normalized = normalizeText(query);

  const vocabulary = vocabularyMatches(normalized);
  const merged = new Map();

  for (const match of vocabulary) {
    for (const num of match.criteria) {
      const criterion = data.byNum.get(num);
      if (!criterion) continue;
      const existing = merged.get(num);
      if (existing && existing.weight >= match.weight) continue;
      merged.set(num, {
        criterion,
        matchType: match.matchType,
        phrase: match.phrase,
        matchedKeywords: match.matchedKeywords,
        weight: match.weight,
        relevanceScore: match.weight
      });
    }
  }

  for (const hit of searchCriteria(normalized, { version, level, limit: maxResults * 2 })) {
    if (merged.has(hit.id)) {
      merged.get(hit.id).relevanceScore = Math.max(
        merged.get(hit.id).relevanceScore,
        hit.relevance
      );
      continue;
    }
    const criterion = data.byNum.get(hit.id);
    if (!criterion) continue;
    merged.set(hit.id, {
      criterion,
      matchType: "fulltext",
      phrase: null,
      matchedKeywords: hit.matchedTerms,
      weight: hit.relevance * 0.5,
      relevanceScore: hit.relevance
    });
  }

  const hasConfidentMatch = [...merged.values()].some(
    (item) => item.matchType !== "fulltext" && item.weight >= 0.75
  );

  const results = [...merged.values()]
    .filter((item) => {
      // Once a developer phrase has matched, a weak full text hit adds noise
      // rather than a second opinion.
      if (hasConfidentMatch && item.matchType === "fulltext" && item.relevanceScore < 0.6) {
        return false;
      }
      return true;
    })
    .filter(({ criterion }) => {
      if (level && criterion.level !== level) return false;
      if (version && !criterion.versions.includes(version)) return false;
      return true;
    })
    .sort((a, b) => b.weight - a.weight || b.relevanceScore - a.relevanceScore)
    .slice(0, maxResults)
    .map((item) => {
      const { criterion } = item;
      return {
        criterion: {
          source: "w3c",
          id: criterion.num,
          slug: criterion.id,
          handle: criterion.handle,
          requirement: criterion.requirement,
          level: criterion.level,
          versions: criterion.versions,
          guideline: criterion.guideline,
          principle: criterion.principle
        },
        match: {
          source: "wcag-translator",
          confidence: confidenceFor(item),
          basis: item.matchType,
          developerPhrase: item.phrase,
          signals: item.matchedKeywords,
          relevance: Math.round(item.relevanceScore * 1000) / 1000,
          explanation: explain(item, criterion)
        },
        techniques: criterion.techniques.slice(0, 8),
        links: criterion.links
      };
    });

  const top = results[0];
  const basisLine = !top
    ? ""
    : top.match.basis === "phrase"
      ? `The strongest is ${top.criterion.id} ${top.criterion.handle}, from a known developer phrase.`
      : top.match.basis === "signals"
        ? `The strongest is ${top.criterion.id} ${top.criterion.handle}, inferred from the wording rather than an exact phrase.`
        : "No developer phrase matched, so these come from full text relevance. Treat them as leads.";

  const summary = results.length
    ? `${results.length} success ${results.length === 1 ? "criterion looks" : "criteria look"} relevant. ${basisLine}`
    : "Nothing matched. Describe the behaviour you are seeing rather than the fix you are considering, and include the element type.";

  return {
    query,
    normalizedQuery: normalized,
    tokens: tokenize(normalized),
    version,
    level: level || "any",
    translation: { source: "wcag-translator", summary, results },
    relatedTechniques: searchTechniques(normalized, { limit: 5 }),
    vocabularyMatches: vocabulary,
    caveat:
      "This points you at the criterion to read. Judging whether a page meets it stays with you. W3C describes techniques as examples of ways to satisfy a criterion, so treat them as options rather than a checklist."
  };
}
