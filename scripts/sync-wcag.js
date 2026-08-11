// Downloads the official W3C machine-readable WCAG JSON.
//
// The W3C files are published monthly and W3C reserve the right to change the
// structure, so this script validates shape before writing anything. A build
// that silently produces an empty data set is worse than a build that fails.

import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const sourceDir = path.join(ROOT, "data", "source");

const SOURCES = {
  "2.2": "https://www.w3.org/WAI/WCAG22/wcag.json",
  "2.1": "https://www.w3.org/WAI/WCAG21/wcag.json"
};

const RETRIES = 3;
const RETRY_DELAY_MS = 2000;
const TIMEOUT_MS = 30_000;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function fetchOnce(url) {
  const response = await fetch(url, {
    signal: AbortSignal.timeout(TIMEOUT_MS),
    headers: {
      Accept: "application/json",
      "User-Agent": "wcag-translator/3.0 (+https://github.com/msschermer/wcag-translator)"
    }
  });

  const contentType = response.headers.get("content-type") || "";
  const body = await response.text();

  if (!response.ok) {
    throw new Error(`HTTP ${response.status} from ${url}: ${body.slice(0, 200)}`);
  }

  // A captive portal, proxy error page or CDN block returns HTTP 200 with HTML.
  // Checking this before JSON.parse turns "Unexpected token '<'" into something
  // that actually says what happened.
  if (!contentType.includes("json") && !body.trimStart().startsWith("{")) {
    throw new Error(
      `Expected JSON from ${url} but got ${contentType || "an unknown content type"}. ` +
        `First bytes: ${body.trimStart().slice(0, 80)}`
    );
  }

  try {
    return JSON.parse(body);
  } catch (error) {
    throw new Error(`Response from ${url} was not valid JSON: ${error.message}`);
  }
}

async function fetchJson(url) {
  let lastError;
  for (let attempt = 1; attempt <= RETRIES; attempt += 1) {
    try {
      return await fetchOnce(url);
    } catch (error) {
      lastError = error;
      if (attempt < RETRIES) {
        console.warn(`  attempt ${attempt} failed (${error.message}), retrying...`);
        await sleep(RETRY_DELAY_MS * attempt);
      }
    }
  }
  throw lastError;
}

// Guards against the exact failure this project hit before: W3C renamed the
// glossary key from `glossary` to `terms`, which silently produced a data set
// with zero glossary entries and an endpoint that 404'd on everything.
function assertShape(version, data) {
  const problems = [];

  if (!Array.isArray(data?.principles) || data.principles.length === 0) {
    problems.push("`principles` is missing or empty");
  }
  if (!Array.isArray(data?.terms) || data.terms.length === 0) {
    problems.push("`terms` is missing or empty (this is the glossary)");
  }

  const firstSc = data?.principles?.[0]?.guidelines?.[0]?.successcriteria?.[0];
  if (!firstSc) {
    problems.push("no success criteria found under principles[].guidelines[].successcriteria[]");
  } else {
    for (const field of ["id", "num", "handle", "title", "level", "versions"]) {
      if (firstSc[field] === undefined) problems.push(`success criteria are missing \`${field}\``);
    }
  }

  if (problems.length) {
    throw new Error(
      `WCAG ${version} JSON does not match the expected structure:\n` +
        problems.map((p) => `  - ${p}`).join("\n") +
        `\n\nThe W3C serialisation has probably changed. See ` +
        `https://github.com/w3c/wcag/pulls?q=is%3Apr+label%3Awcag.json`
    );
  }
}

async function main() {
  await fs.mkdir(sourceDir, { recursive: true });

  for (const [version, url] of Object.entries(SOURCES)) {
    console.log(`Fetching WCAG ${version} from ${url}`);
    const data = await fetchJson(url);
    assertShape(version, data);

    const destination = path.join(sourceDir, `wcag-${version}.json`);
    await fs.writeFile(destination, JSON.stringify(data, null, 2), "utf8");

    const scCount = data.principles.flatMap((p) =>
      p.guidelines.flatMap((g) => g.successcriteria)
    ).length;
    console.log(`  ${scCount} success criteria, ${data.terms.length} glossary terms -> ${destination}`);
  }

  console.log("WCAG source sync complete.");
}

main().catch((error) => {
  console.error("\nWCAG sync failed.\n");
  console.error(error.message);
  process.exit(1);
});
