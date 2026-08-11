# WCAG Translator

A developer facing API that turns plain engineering language into WCAG success
criteria, techniques and terminology.

You send it a sentence someone would actually type into a ticket:

```
"focus disappears behind the sticky header"
```

It returns the standard that sentence is about:

```
2.4.11  Focus Not Obscured (Minimum)   Level AA   WCAG 2.2
confidence: high   basis: signals
techniques: C43
```

It translates between two vocabularies. That is the whole product.

Everything runs against the indexed W3C data on this server. Evaluating a page
and judging conformance stay with you, which is what keeps the output something
you can trust and cite.

---

## Why this is an API rather than a website

Every accessibility tool in this space is a scanner with a dashboard. This one
is a lookup layer other tools can call: a linter rule that wants to cite the
right criterion, a ticket template that wants to attach the right technique
links, a docs site that wants glossary definitions, a CI step that wants to turn
an axe rule id into human guidance.

The web page in `public/` is a demo of the API. It is not the product.

---

## What it does

- Maps developer language to success criteria, with an explicit match basis
  (`phrase`, `signals`, or `fulltext`) and a confidence label
- Maps automated checker rule ids to the same criteria, in the same response
  shape: axe-core rule ids, Lighthouse audit ids, and Pa11y / HTML_CodeSniffer
  codes
- Ingests a whole axe-core, Lighthouse or Pa11y report and rolls it up by
  criterion, weighted by how many elements each finding affects
- Reports how much of WCAG automated tooling can reach at all
- Ranked full text search across criteria, techniques and glossary
- Criterion, technique and glossary lookup, individually and as collections
- WCAG 2.2 and 2.1, filterable by version and conformance level
- Keeps W3C material and locally added material rigorously separate

## Where the boundaries sit

- **Deterministic by design.** Matching runs against the indexed WCAG data on
  the server. Keeping a model out of it is what makes the interesting part of
  this project mine, and makes the same input give the same answer every time.
- **Guidance, not evaluation.** The API tells you which criterion your problem
  is about. Looking at the page and deciding whether it meets that criterion is
  yours, and `/v1/coverage` is honest about how much of WCAG any tool reaches.
- **Techniques are options.** W3C describe them as examples of ways to satisfy a
  criterion, and the API repeats that in every response rather than presenting
  them as a checklist.

---

## Data and attribution

All WCAG content comes from the machine readable JSON W3C publish monthly:

- https://www.w3.org/WAI/WCAG22/wcag.json
- https://www.w3.org/WAI/WCAG21/wcag.json

W3C permit reuse with attribution, on the condition that the content is not
changed and that anything added is clearly distinguishable from W3C material.
This is enforced in the response shape rather than mentioned in a footnote:

| | |
| --- | --- |
| `source: "w3c"` | Principles, guidelines, success criteria, the original requirement HTML, glossary definitions, criterion to technique associations. Reproduced byte for byte. |
| `source: "wcag-translator"` | Developer phrase dictionary, signal words, relevance scores, confidence labels, match explanations, derived plain text fields. |

Original HTML is preserved untouched in `content` and `definition`. Anything
derived from it lives under a separate `derived` key. Every response carries an
`attribution` block.

See `data/README.md` for the structure traps in the W3C source and how the build
guards against them.

---

## Local development

Requires Node 22 or newer.

```bash
npm ci
npm run sync:wcag     # download the W3C JSON
npm run build:data    # normalise it, then generate the checker rule map
npm run build:fonts   # copy IBM Plex out of @fontsource into public/fonts
npm test              # runs against the committed fixture, no network needed
npm start             # http://localhost:3000
```

`npm run dev` starts it with file watching.

The test suite deliberately does not depend on w3.org. It runs against
`data/fixtures/`, a small subset in real W3C shape. CI runs the live fetch as a
separate non-blocking job so a W3C structure change is visible without breaking
every unrelated pull request.

---

## API

Base path is `/v1`. No endpoint requires authentication.

### Translate

```bash
curl -sS localhost:3000/v1/translate \
  -H 'content-type: application/json' \
  -d '{"query":"my button has no accessible name","version":"2.2"}'
```

```
GET  /v1/translate?q=...&version=2.2&level=AA&limit=5
POST /v1/translate   { query, version, level, maxResults }
```

Each result carries a `match` object explaining itself:

| `basis` | Meaning |
| --- | --- |
| `phrase` | The query contained a known developer phrase. Highest trust. |
| `signals` | The query carried the required signal words for a phrase without matching it verbatim. |
| `fulltext` | Ranked text relevance only. A lead, not an answer. |

### Translate a checker rule id

The other half of the interoperability story. A team already running axe in CI
has rule ids, not sentences.

```bash
curl -sS localhost:3000/v1/translate/rule \
  -H 'content-type: application/json' \
  -d '{"rules":["color-contrast","button-name","link-name","region"]}'
```

```
4 rule ids in, 3 distinct success criteria out, 1 with no WCAG mapping.

  1.4.3  Contrast (Minimum)         AA  <- color-contrast
  2.4.4  Link Purpose (In Context)  A   <- link-name
  4.1.2  Name, Role, Value          A   <- button-name, link-name

  region: best practice, no WCAG mapping
```

```
POST /v1/translate/rule   { rule | rules, version, level }   up to 100 ids
GET  /v1/translate/rule?rule=image-alt,color-contrast
GET  /v1/rules?engine=axe&criterion=4.1.2&mapped=true
GET  /v1/rules/color-contrast
```

Results come back in exactly the same shape as `/v1/translate`, so a client can
pipe either input into the same renderer. That is asserted in the test suite,
not just claimed.

Three behaviours worth knowing:

- **Unmapped rules still get an answer.** About a quarter of axe rules are
  best-practice or experimental checks with no WCAG tag. Those resolve with
  `wcagMapped: false` and a note, because "this fired, and here is why it maps
  to nothing in WCAG" is a useful answer in its own right.
- **Filtering explains itself.** If a level or version filter removes a
  criterion the rule maps to, the excluded entry and the reason come back rather
  than the criterion silently vanishing.
- **Unknown ids suggest alternatives.** `colour-contrast` returns
  `color-contrast`. Typos and spelling variants are the common case.

### Translate a whole scanner report

Rule ids one at a time is still friction. A CI step has a file.

```bash
curl -sS localhost:3000/v1/report \
  -H 'content-type: application/json' \
  --data-binary @axe-results.json
```

```
3 failing checks across 5 elements map to 2 success criteria.
1 further check needs human review.

  4.1.2  Name, Role, Value    critical  1 element   <- button-name
  1.4.3  Contrast (Minimum)   serious   3 elements  <- color-contrast
```

The format is detected from the shape of the body: an axe results object with
`violations`, a Lighthouse LHR with `audits`, a Pa11y issue array, or a plain
array of rule ids. Node counts and impact carry through onto the criterion, so
the rollup is ordered by how much of the page is affected rather than by
criterion number.

axe's `incomplete` entries are reported separately under `report.needsReview`
rather than folded into the failures. "Needs a human look" and "failed" are
different answers, and collapsing them overstates the result.

Post the raw scanner output directly, or wrap it as
`{ "report": <output>, "level": "AA" }` if you need filters.

### Coverage: what automation can actually see

The most useful thing this data set can say that no scanner will tell you.

```
GET /v1/coverage
GET /v1/coverage?coverage=manual-only&level=AA
GET /v1/criteria/1.4.3/coverage
GET /v1/criteria/4.1.2/related
```

Every criterion is classified:

| | |
| --- | --- |
| `automated` | An engine publishes a rule claiming this criterion. Automated checks can find *some* failures here. |
| `assisted` | Only a manual prompt, or a mapping this service supplies, reaches it. No engine claims it. |
| `manual-only` | Yours to judge. No automated rule reaches it, so a person decides. |

A mapping this service adds never upgrades a criterion to `automated`. That
guarantee is asserted structurally in the test suite rather than spot-checked
against one criterion, so it holds as the vocabulary and alias files grow.

This is the honest answer to "we run axe in CI, are we accessible?" — a number,
and a clear picture of which criteria still need a person.

`/v1/criteria/:id/related` ranks other criteria by how many W3C techniques they
share with this one. Criteria satisfied by the same techniques tend to fail
together, which is what a developer wants to see next.

### Where the rule mappings come from

| Engine | Source | How |
| --- | --- | --- |
| axe-core | `axe-core` itself, MPL-2.0 | Every axe rule carries WCAG tags (`wcag143`). The map is generated from `axe.getRules()` at build time, so it tracks whatever axe version is pinned. |
| Pa11y / HTML_CodeSniffer | none needed | Those codes embed the criterion (`Guideline1_4.1_4_3`). Parsed at request time, so no table can go stale. |
| Lighthouse | mostly axe, plus `data/lighthouse-aliases.json` | Most Lighthouse a11y audits wrap axe and resolve by the same id. Only the manual and Lighthouse-specific audits need a local entry. |

Anything the local alias file supplies is tagged `criteriaSource:
"wcag-translator"`, so an engine-published mapping is never presented as
interchangeable with one this project decided on.

axe-core is a **dev dependency**. It is used to generate the map at build time
and is not present in the runtime image.

### Everything else

```
GET /v1/search?q=contrast%20ratio&limit=10
GET /v1/criteria?level=AA&limit=50&offset=0
GET /v1/criteria/1.4.3                      # number, "SC 1.4.3", or slug
GET /v1/techniques?criterion=4.1.2&technology=aria&category=sufficient
GET /v1/techniques/H37
GET /v1/glossary?limit=50
GET /v1/glossary/accessible%20name
GET /v1/coverage?coverage=manual-only&level=AA
GET /v1/criteria/1.4.3/coverage
GET /v1/criteria/4.1.2/related
GET /v1/health
GET /v1/meta
GET /v1/stats
GET /v1/openapi.yaml
```

Full specification: `openapi/openapi.yaml`, served live at `/v1/openapi.yaml`.

### Authentication

Optional. Keys are configured with `API_KEYS=key_one,key_two` and sent as
`X-API-Key: key_one` or `Authorization: Bearer key_one`. The only effect is a
higher rate limit; no endpoint is gated behind a key.

### Rate limiting

60 requests per minute anonymous, 300 authenticated, per window, both
configurable. `X-RateLimit-Limit`, `X-RateLimit-Remaining` and
`X-RateLimit-Reset` are on every response; 429s carry `Retry-After`.

State lives in process memory, which is correct for a single container and is
what this runs as. Scaling horizontally requires a shared store such as Redis.
That is a known and deliberate limit, not an oversight.

---

## Design notes

**Ranking is BM25, not substring matching.** Scoring a document by
`title.includes(token)` means "id" matches "video", "aria" matches "criteria",
and long criteria always outrank short ones because they contain more
characters. BM25 weights rare terms above common ones and normalises for
document length. Stemming is deliberately conservative: full Porter stemming
turns "aria" into "ari" and "focus" into "focu", which costs more precision than
the recall is worth on a corpus this size.

**The vocabulary reaches 67 of 87 criteria, on purpose.** 52 phrases cover
what developers actually write in tickets. The 20 left out are media production,
editorial concerns and AAA variants of criteria already reachable through their
AA sibling — writing phrases for those would add false-positive surface without
ever being the right answer. `data/README.md` lists them and the reasoning.
`/v1/stats` reports the reach so the gap stays visible.

**Vocabulary matching is word boundary aware, and gated on signal groups.**
`normalized.includes("name")` also fires on "filename", "namespace" and
"surname". Each phrase declares `requires` groups, all of which must be
satisfied for a non verbatim match, which is what stops "the button colour is
wrong" from resolving to "button has no accessible name" purely because both
mention a button.

**The data set is baked into the image at build time.** A container that cannot
reach w3.org still serves correct guidance, and a W3C outage cannot take
production down during a restart. `/v1/health` reports the data set age and
flags `stale: true` past 45 days, since W3C republish monthly. A scheduled
workflow rebuilds the image on the 5th of each month.

**`trust proxy` must be a number.** Express treats a string value as an address
list and ipaddr.js parses `"1"` as the IPv4 address `0.0.0.1`, so
`app.set("trust proxy", "1")` does not throw. It quietly trusts nobody, which
behind a reverse proxy makes every request appear to come from the proxy's
container IP and collapses per client rate limiting into one global bucket.
`config.js` coerces `TRUST_PROXY` to a number, and `test/config.test.js` pins
both the broken and correct behaviour.

**The interface is an application, not a page.** It occupies the viewport:
topbar, three working columns, status bar, with each column scrolling inside
itself so the document never does. Four input modes (plain language, rule ids, a
whole report, direct lookup) share one results panel, because the API returns
the same result shape for all of them. Results collapse to one scannable row
each and open on demand; supporting detail lives in tooltips and disclosures so
the working surface stays clear.

**IBM Plex is self hosted.** The API runs under `style-src 'self'` and
`font-src 'self'`, which blocks a Google Fonts stylesheet and leaves the
identity falling back to system faces. Keeping the header and self hosting was
the better trade: `scripts/build-fonts.js` copies the woff2 files out of the
`@fontsource` dev dependencies at build time and generates the `@font-face`
rules, so the render path stays first party.

**The demo page meets AA.** A tool about WCAG that fails WCAG is an anecdote.
Every colour pair in `styles.css` is verified at 4.5:1 or better, there is a
skip link, results announce through a live region, focus is always visible,
reduced motion is respected, and nothing is hidden at any breakpoint. The client
builds DOM nodes rather than HTML strings, so the page runs under a strict CSP
with no inline script or style.

---

## Deployment

```
laptop -> GitHub -> Actions -> GHCR -> DigitalOcean docker host -> Caddy -> Cloudflare
```

Local Docker:

```bash
docker compose build
docker compose up -d
```

Production pulls `ghcr.io/msschermer/wcag-translator:latest` from the
`portfolio-infra` compose file. See `DEPLOY.md`.

---

## Roadmap

Ordered by how much each one strengthens the case that this is an
interoperability layer rather than another scanner.

1. **Batch translate for language.** Rule and report ingest already batch; the
   language endpoint should too, for bulk ticket triage.
2. **A published client.** A small npm package wrapping the endpoints, plus a
   CI reporter that turns an axe JSON run straight into a criteria rollup.
3. **Optional `/v1/translate/advanced`.** If an LLM is ever added, it consumes
   this structured knowledge base rather than replacing it, and it lives behind
   a separate path so the deterministic endpoint stays deterministic.

---

## Licence

Application code is MIT.

WCAG content belongs to W3C and is reproduced unchanged under the W3C Document
License.

axe-core rule metadata (rule ids, help text, help URLs and WCAG tags) is
generated from axe-core, which is MPL-2.0, and is attributed as such in
`/v1/rules` and in the generated rule map.

IBM Plex is licensed under the SIL Open Font License 1.1 and is self hosted from
`public/fonts`, generated at build time from the `@fontsource` packages.

See `LICENSE`.
