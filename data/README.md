# Data

WCAG Translator does not keep a hand written copy of WCAG. Everything W3C
publishes is fetched at build time and normalised into the shape the API serves.

## Sources

- WCAG 2.2: https://www.w3.org/WAI/WCAG22/wcag.json
- WCAG 2.1: https://www.w3.org/WAI/WCAG21/wcag.json

W3C publish these monthly and reserve the right to change the structure. See
https://github.com/w3c/wcag/tree/main/11ty/json#readme

## Directories

| Path | Committed | What it is |
| --- | --- | --- |
| `developer-vocabulary.json` | yes | Developer phrase dictionary. Maintained here. Not W3C content. |
| `lighthouse-aliases.json` | yes | Lighthouse audit ids that do not share a name with an axe rule. Maintained here. Not engine metadata. |
| `fixtures/wcag-2.2.json`, `fixtures/wcag-2.1.json` | yes | Small subset in real W3C shape. The test suite runs against these so tests never need the network. |
| `source/` | no | Raw downloads from W3C. Reproducible via `npm run sync:wcag`. |
| `generated/` | no | Normalised output. Reproducible via `npm run build:data`. |
| `fixtures/generated/` | no | Same, built from the fixture by `npm run build:fixture`. |

## Rebuilding

```
npm run sync:wcag     # download the W3C JSON
npm run build:data    # normalise it, then generate the checker rule map
```

`build:data` runs `build-data.js` then `build-rules.js`. The second reads
`axe.getRules()` from the pinned axe-core dev dependency and writes
`generated/rules.json`. Bumping axe-core and rebuilding is the whole update
path for the rule mappings.

## Checker rule mappings

axe rules tag themselves with the criteria they check, in the form `wcag143`.
Parsing is unambiguous because WCAG principles run 1 to 4 and every guideline
number is a single digit, so the first two digits are principle and guideline
and the rest is the criterion index: `wcag2410` is 2.4.10, not 24.1.0.

Roughly a quarter of axe rules carry no WCAG tag at all. Those are best-practice
or experimental checks. They are kept in the map with `wcagMapped: false` rather
than dropped, because a caller asking about one deserves an answer.

axe-core is MPL-2.0. The generated map records the version, source and licence,
and `/v1/rules` returns that in its `meta.engines` block.

## Known W3C structure traps

These are the things that broke a previous build. `sync-wcag.js` asserts the
first two before writing anything, and `build-data.js` refuses to emit an empty
or obviously wrong data set.

1. **The glossary key is `terms`, not `glossary`.** Reading `data.glossary`
   returns undefined and produces a silently empty glossary.
2. **`handle` is the short name, `title` is the full requirement sentence.**
   They are easy to swap and the mistake only shows up visually.
3. **Techniques nest five ways.** A success criterion's techniques can sit
   directly under a category, or inside `techniques`, `groups`, `using`, or
   `and`, at arbitrary depth. Walking only two levels loses a large share of
   them.
4. **Group `id` values are section anchors, not technique ids.** Strings like
   `text-equiv-all-situation-a-shorttext` must never enter the technique index.
   Real technique ids always match `/^[A-Z]+\d+$/`.
5. **4.1.1 Parsing exists in the 2.2 file with `versions: ["2.0","2.1"]`.**
   Building an Understanding URL under `/WCAG22/` for it returns a 404.

## Terms of use

W3C permit reuse with attribution provided the content is not changed, and
require that anything added is clearly distinguishable from W3C material. This
project satisfies that by keeping the original `content` and `definition` HTML
byte for byte, putting anything it derives under a separate `derived` key, and
tagging every object with `source: "w3c"` or `source: "wcag-translator"`.

## The developer vocabulary

52 phrases reaching 67 of the 87 success criteria. This is the dictionary that
turns a sentence into a confident answer: a query that hits a phrase comes back
as `basis: "phrase"` or `basis: "signals"`, and anything that misses falls
through to full text ranking at low confidence.

Each entry carries `requires`: groups of alternatives that must **all** be
satisfied for a non-verbatim match. This is the precision control. A single
loose group means the phrase fires on any sentence containing one common word —
"missing alt text" once matched "our brand image needs updating" because
`image` alone was enough to satisfy it.

`test/vocabulary.test.js` probes the dictionary directly, independent of the
WCAG data: one case per phrase that should fire, plus a set of near-miss
sentences that must stay quiet. Add both when you add a phrase.

### The 20 criteria deliberately left uncovered

Coverage is not the goal; precision is. These are criteria nobody describes in
engineering language, so a phrase for them would add false-positive surface
without ever being the right answer:

- **Media production** (1.2.1, 1.2.6 to 1.2.9) — sign language interpretation,
  extended audio description, live audio-only. Decided in production, not in a
  ticket.
- **Content authoring** (3.1.3 to 3.1.6, 1.4.8, 3.3.5) — reading level, unusual
  words, abbreviations, pronunciation, visual presentation of prose. These are
  editorial concerns a developer would not file.
- **AAA variants already reachable through their AA sibling** (2.2.3, 2.2.4,
  2.2.5, 1.4.7, 2.5.6, 1.3.6).
- **2.3.2 Three Flashes** — the AA phrase for flashing content already returns
  2.3.1, and both live in the same sentence a developer would write.
- **4.1.1 Parsing** — removed in WCAG 2.2. Present in the data set with
  `versions: ["2.0", "2.1"]`, and intentionally not something to steer people
  towards.

Everything in that list is still reachable through `/v1/search` and through full
text ranking in `/v1/translate`. It just does not get a high-confidence claim.
