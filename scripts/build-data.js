// Normalises the W3C WCAG JSON into the data set the API serves.
//
// Usage:
//   node scripts/build-data.js
//   node scripts/build-data.js --source data/fixtures --out data/fixtures/generated

import fs from "node:fs/promises";
import crypto from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { stripHtml, tokenize, unique } from "../src/utils/normalize.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function arg(name, fallback) {
  const index = process.argv.indexOf(`--${name}`);
  return index > -1 && process.argv[index + 1] ? process.argv[index + 1] : fallback;
}

const sourceDir = path.resolve(ROOT, arg("source", "data/source"));
const outDir = path.resolve(ROOT, arg("out", "data/generated"));

const readJson = async (dir, file) =>
  JSON.parse(await fs.readFile(path.join(dir, file), "utf8"));

/**
 * Walks a success criterion's technique tree.
 *
 * The W3C shape nests techniques five different ways and the naive version of
 * this loses roughly a third of them:
 *   techniques.<category>[]                 - a technique, or a "situation" wrapper
 *     .techniques[]                         - techniques inside a situation
 *     .groups[]                             - named groups inside a situation
 *       .techniques[]
 *     .using[]                              - "using one of the following"
 *     .and[]                                - "technique X AND technique Y"
 * Any node can carry `using` and `and` at any depth, so this recurses instead
 * of unrolling two levels by hand.
 *
 * Group `id` values (e.g. "text-equiv-all-situation-a-shorttext") are section
 * anchors, not technique ids, so they are never emitted as techniques.
 */
function collectTechniques(node, category, out, depth = 0) {
  if (!node || depth > 12) return;

  if (Array.isArray(node)) {
    for (const child of node) collectTechniques(child, category, out, depth + 1);
    return;
  }

  // A real technique always has an id shaped like G18, H37, ARIA6, SCR34, F65, C22, PDF1, T1.
  if (typeof node.id === "string" && /^[A-Z]+\d+$/.test(node.id)) {
    out.push({
      id: node.id,
      title: stripHtml(node.title || ""),
      technology: node.technology || null,
      category
    });
  }

  for (const key of ["techniques", "groups", "using", "and"]) {
    if (node[key]) collectTechniques(node[key], category, out, depth + 1);
  }
}

const CATEGORIES = ["sufficient", "advisory", "failure"];

function techniquesForCriterion(criterion) {
  const out = [];
  for (const category of CATEGORIES) {
    collectTechniques(criterion.techniques?.[category], category, out, 0);
  }
  // Same technique can legitimately appear under two categories, so the key is
  // id + category rather than id alone.
  const seen = new Set();
  return out.filter((t) => {
    const key = `${t.id}:${t.category}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

const understandingUrl = (version, id) =>
  `https://www.w3.org/WAI/WCAG${version.replace(".", "")}/Understanding/${id}`;

const quickrefUrl = (version, id) =>
  `https://www.w3.org/WAI/WCAG${version.replace(".", "")}/quickref/#${id}`;

const techniqueUrl = (version, technology, id) =>
  technology
    ? `https://www.w3.org/WAI/WCAG${version.replace(".", "")}/Techniques/${technology}/${id}`
    : null;

function flatten(data, sourceVersion) {
  const criteria = [];
  const techniques = new Map();

  for (const principle of data.principles || []) {
    for (const guideline of principle.guidelines || []) {
      for (const sc of guideline.successcriteria || []) {
        const scTechniques = techniquesForCriterion(sc);

        for (const t of scTechniques) {
          const existing = techniques.get(t.id);
          if (!existing) {
            techniques.set(t.id, {
              id: t.id,
              title: t.title,
              technology: t.technology,
              categories: [t.category],
              criteria: [sc.num],
              url: techniqueUrl(sourceVersion, t.technology, t.id),
              source: "w3c"
            });
          } else {
            existing.categories = unique([...existing.categories, t.category]);
            existing.criteria = unique([...existing.criteria, sc.num]);
            if (!existing.title && t.title) existing.title = t.title;
            if (!existing.technology && t.technology) {
              existing.technology = t.technology;
              existing.url = techniqueUrl(sourceVersion, t.technology, t.id);
            }
          }
        }

        criteria.push({
          id: sc.id,
          num: sc.num,
          // `handle` is the short name ("Name, Role, Value"); `title` is the
          // full requirement sentence. Swapping these is the difference between
          // "WCAG 4.1.2 Name, Role, Value" and a paragraph in a heading slot.
          handle: sc.handle,
          requirement: sc.title,
          level: sc.level || null,
          versions: sc.versions || [],
          alt_id: sc.alt_id || [],
          // W3C content, preserved byte for byte.
          content: sc.content,
          details: sc.details || [],
          principle: { id: principle.id, num: principle.num, handle: principle.handle },
          guideline: { id: guideline.id, num: guideline.num, handle: guideline.handle },
          techniques: scTechniques,
          source: "w3c",
          // Everything below is derived by this project, not W3C material.
          derived: {
            source: "wcag-translator",
            text: stripHtml(sc.content || sc.title || ""),
            detailsText: (sc.details || [])
              .flatMap((d) => (d.items || []).map((i) => `${i.handle || ""} ${i.text || ""}`))
              .concat((sc.details || []).map((d) => d.text || ""))
              .join(" ")
              .replace(/\s+/g, " ")
              .trim()
          }
        });
      }
    }
  }

  return { criteria, techniques: [...techniques.values()] };
}

// W3C key is `terms`, not `glossary`. Accepting both means a future rename in
// either direction does not silently empty the glossary.
function flattenGlossary(data) {
  const entries = data.terms || data.glossary || [];
  return entries.map((entry) => ({
    id: entry.id,
    name: entry.name,
    definition: entry.definition,
    source: "w3c",
    derived: { source: "wcag-translator", text: stripHtml(entry.definition || "") }
  }));
}

function buildSearchIndex(criteria, techniques, glossary) {
  const docs = [];

  for (const c of criteria) {
    docs.push({
      type: "criterion",
      ref: c.num,
      fields: {
        title: tokenize(`${c.num} ${c.handle}`),
        body: tokenize(`${c.requirement} ${c.derived.detailsText}`),
        context: tokenize(`${c.guideline.handle} ${c.principle.handle} level ${c.level}`)
      }
    });
  }
  for (const t of techniques) {
    docs.push({
      type: "technique",
      ref: t.id,
      fields: {
        title: tokenize(`${t.id} ${t.title}`),
        body: tokenize(t.title),
        context: tokenize(`${t.technology || ""} ${t.categories.join(" ")}`)
      }
    });
  }
  for (const g of glossary) {
    docs.push({
      type: "glossary",
      ref: g.id,
      fields: {
        title: tokenize(g.name),
        body: tokenize(g.derived.text),
        context: []
      }
    });
  }

  // Document frequency per type, so a term common among criteria does not get
  // discounted in the technique index and vice versa.
  const df = {};
  const counts = {};
  for (const doc of docs) {
    df[doc.type] ||= {};
    counts[doc.type] = (counts[doc.type] || 0) + 1;
    const terms = new Set([...doc.fields.title, ...doc.fields.body, ...doc.fields.context]);
    for (const term of terms) df[doc.type][term] = (df[doc.type][term] || 0) + 1;
  }

  const avgLength = {};
  for (const type of Object.keys(counts)) {
    const typed = docs.filter((d) => d.type === type);
    avgLength[type] =
      typed.reduce(
        (sum, d) => sum + d.fields.title.length + d.fields.body.length + d.fields.context.length,
        0
      ) / (typed.length || 1);
  }

  return { docs, df, counts, avgLength };
}

async function main() {
  await fs.mkdir(outDir, { recursive: true });

  const files = await fs.readdir(sourceDir);
  const versions = files
    .filter((f) => /^wcag-\d\.\d\.json$/.test(f))
    .map((f) => f.replace(/^wcag-|\.json$/g, ""))
    .sort()
    .reverse(); // newest first, so 2.2 wins on conflict

  if (!versions.length) {
    throw new Error(`No wcag-<version>.json files found in ${sourceDir}. Run npm run sync:wcag first.`);
  }

  const criteriaByNum = new Map();
  const techniquesById = new Map();
  const glossaryById = new Map();
  const sourceUrls = {};

  for (const version of versions) {
    const data = await readJson(sourceDir, `wcag-${version}.json`);
    sourceUrls[version] = `https://www.w3.org/WAI/WCAG${version.replace(".", "")}/wcag.json`;

    const { criteria, techniques } = flatten(data, version);

    for (const criterion of criteria) {
      const existing = criteriaByNum.get(criterion.num);
      if (!existing) {
        criteriaByNum.set(criterion.num, criterion);
        continue;
      }
      // Newest version already seated. Merge only what the older file adds.
      existing.versions = unique([...existing.versions, ...criterion.versions]);
      const seen = new Set(existing.techniques.map((t) => `${t.id}:${t.category}`));
      for (const t of criterion.techniques) {
        if (!seen.has(`${t.id}:${t.category}`)) {
          existing.techniques.push(t);
          seen.add(`${t.id}:${t.category}`);
        }
      }
    }

    for (const technique of techniques) {
      const existing = techniquesById.get(technique.id);
      if (!existing) {
        techniquesById.set(technique.id, technique);
        continue;
      }
      existing.criteria = unique([...existing.criteria, ...technique.criteria]);
      existing.categories = unique([...existing.categories, ...technique.categories]);
      if (!existing.title && technique.title) existing.title = technique.title;
      if (!existing.url && technique.url) existing.url = technique.url;
    }

    for (const entry of flattenGlossary(data)) {
      if (!glossaryById.has(entry.id)) glossaryById.set(entry.id, entry);
    }
  }

  // Documentation links depend on which version a criterion actually shipped in.
  // Pointing a 2.1-only criterion at a WCAG22/Understanding URL yields a 404.
  for (const criterion of criteriaByNum.values()) {
    const latest = criterion.versions.includes("2.2") ? "2.2" : "2.1";
    criterion.links = {
      source: "wcag-translator",
      understanding: understandingUrl(latest, criterion.id),
      quickref: quickrefUrl(latest, criterion.id),
      specification: `https://www.w3.org/TR/WCAG${latest.replace(".", "")}/#${criterion.id}`
    };
    criterion.techniques.sort((a, b) =>
      a.category === b.category ? a.id.localeCompare(b.id) : CATEGORIES.indexOf(a.category) - CATEGORIES.indexOf(b.category)
    );
  }

  const criteria = [...criteriaByNum.values()].sort((a, b) =>
    a.num.localeCompare(b.num, undefined, { numeric: true })
  );
  const techniques = [...techniquesById.values()].sort((a, b) => a.id.localeCompare(b.id));
  const glossary = [...glossaryById.values()].sort((a, b) => a.name.localeCompare(b.name));

  const vocabulary = await readJson(path.join(ROOT, "data"), "developer-vocabulary.json");

  // Fail loudly rather than shipping an empty index.
  const known = new Set(criteria.map((c) => c.num));
  const missing = vocabulary.terms
    .flatMap((t) => t.criteria)
    .filter((num) => !known.has(num));
  if (missing.length) {
    const message = `developer-vocabulary.json references success criteria absent from the WCAG source: ${unique(missing).join(", ")}`;
    // The test fixture is a deliberate subset, so partial builds only warn.
    if (process.argv.includes("--allow-partial")) console.warn(`  note: ${message}`);
    else throw new Error(message);
  }
  if (!glossary.length) throw new Error("Glossary is empty. Check the W3C `terms` key.");
  const minTechniques = process.argv.includes("--allow-partial") ? 5 : 100;
  if (techniques.length < minTechniques)
    throw new Error(`Only ${techniques.length} techniques extracted (expected at least ${minTechniques}). The technique walker is broken.`);

  const index = {
    generatedAt: new Date().toISOString(),
    versions,
    defaultVersion: versions[0],
    source: sourceUrls,
    counts: {
      criteria: criteria.length,
      techniques: techniques.length,
      glossary: glossary.length,
      vocabularyPhrases: vocabulary.terms.length
    },
    checksum: crypto
      .createHash("sha256")
      .update(JSON.stringify([criteria, techniques, glossary]))
      .digest("hex")
      .slice(0, 16)
  };

  const search = buildSearchIndex(criteria, techniques, glossary);

  const write = (name, value) =>
    fs.writeFile(path.join(outDir, name), JSON.stringify(value), "utf8");

  await Promise.all([
    write("index.json", index),
    write("criteria.json", criteria),
    write("techniques.json", techniques),
    write("glossary.json", glossary),
    write("vocabulary.json", vocabulary),
    write("search-index.json", search)
  ]);

  console.log(
    `Generated ${index.counts.criteria} criteria, ${index.counts.techniques} techniques, ` +
      `${index.counts.glossary} glossary terms, ${index.counts.vocabularyPhrases} vocabulary phrases ` +
      `(checksum ${index.checksum}) -> ${outDir}`
  );
}

main().catch((error) => {
  console.error("\nData build failed.\n");
  console.error(error.message);
  process.exit(1);
});
