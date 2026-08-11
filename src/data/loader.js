import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { config } from "../config/config.js";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const dataDir = path.resolve(projectRoot, config.dataDir || "data/generated");

let cache = null;

function readJson(filename) {
  const filePath = path.join(dataDir, filename);
  if (!fs.existsSync(filePath)) {
    throw new Error(
      `Generated data file is missing: ${filePath}\n` +
        `Run: npm run sync:wcag && npm run build:data`
    );
  }
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

export function loadData() {
  if (cache) return cache;

  const criteria = readJson("criteria.json");
  const techniques = readJson("techniques.json");
  const glossary = readJson("glossary.json");

  cache = {
    index: readJson("index.json"),
    criteria,
    techniques,
    glossary,
    vocabulary: readJson("vocabulary.json"),
    search: readJson("search-index.json"),
    // O(1) lookups instead of Array.find on every request.
    byNum: new Map(criteria.map((c) => [c.num, c])),
    bySlug: new Map(criteria.map((c) => [c.id, c])),
    techniqueById: new Map(techniques.map((t) => [t.id.toUpperCase(), t])),
    glossaryById: new Map(glossary.map((g) => [g.id, g])),
    glossaryByName: new Map(glossary.map((g) => [g.name.toLowerCase(), g]))
  };

  return cache;
}

export function clearDataCache() {
  cache = null;
}

export const dataDirectory = dataDir;
