const $ = (selector) => document.querySelector(selector);

const el = (tag, className, text) => {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
};

const clear = (node) => { while (node.firstChild) node.removeChild(node.firstChild); };

const results = $("#results");
const resultsScroll = $("#results-scroll");
const summaryLine = $("#summary");
const statusPill = $("#status");
const runButton = $("#run");
const versionField = $("#version");
const levelField = $("#level");
const modeNote = $("#mode-note");

const MODES = {
  text: { note: "plain language", run: runText },
  rule: { note: "checker rule ids", run: runRule },
  report: { note: "scanner report", run: runReport },
  lookup: { note: "direct lookup", run: runLookup }
};

let mode = "text";

/* ---------- status and messaging ---------- */

function setStatus(text, state) {
  statusPill.textContent = text;
  if (state) statusPill.dataset.state = state;
  else delete statusPill.dataset.state;
}

function setSummary(text) {
  summaryLine.textContent = text;
}

function notice(text, isError = false) {
  const node = el("p", isError ? "notice is-error" : "notice", text);
  results.appendChild(node);
}

/* ---------- shared renderers ---------- */

function badge(text, kind) {
  return el("span", `badge badge-${kind}`, text);
}

function techniqueChips(techniques) {
  const list = el("ul", "chips");
  for (const technique of techniques.slice(0, 8)) {
    const item = document.createElement("li");
    if (technique.technology) {
      const link = el("a", null, technique.id);
      link.href = `https://www.w3.org/WAI/WCAG22/Techniques/${technique.technology}/${technique.id}`;
      link.target = "_blank";
      link.rel = "noopener";
      // 2.4.4: "H37" on its own does not describe where the link goes.
      link.setAttribute("aria-label", `Technique ${technique.id}, ${technique.category}: ${technique.title}`);
      link.title = technique.title;
      item.appendChild(link);
    } else {
      item.appendChild(el("span", null, technique.id));
    }
    list.appendChild(item);
  }
  return list;
}

/**
 * One success criterion, rendered as a collapsed row that opens on demand.
 *
 * Every mode returns several criteria, and expanding all of them produced a
 * wall of near-identical explanation boxes that buried the answer. The header
 * row carries everything needed to scan the result set; the detail is one
 * click away.
 */
function criterionCard(result, { open = false } = {}) {
  const card = el("li", "rescard");
  if (result.match?.confidence) card.dataset.confidence = result.match.confidence;

  const bodyId = `body-${result.criterion.id.replace(/\./g, "-")}-${Math.random().toString(36).slice(2, 7)}`;

  const head = el("button", "rescard-head");
  head.type = "button";
  head.setAttribute("aria-expanded", String(open));
  head.setAttribute("aria-controls", bodyId);

  const caret = el("span", "rescard-caret", "\u203A");
  caret.setAttribute("aria-hidden", "true");
  head.appendChild(caret);
  head.appendChild(el("span", "rescard-num", result.criterion.id));
  head.appendChild(el("span", "rescard-title", result.criterion.handle));

  const badges = el("div", "badges");
  badges.appendChild(badge(result.criterion.level, "level"));
  if (result.match?.confidence) badges.appendChild(badge(result.match.confidence, result.match.confidence));
  if (result.match?.impact) badges.appendChild(badge(result.match.impact, result.match.impact));
  if (result.match?.occurrences) badges.appendChild(badge(`${result.match.occurrences} el`, "count"));
  head.appendChild(badges);
  card.appendChild(head);

  const body = el("div", "rescard-body");
  body.id = bodyId;
  body.hidden = !open;

  if (result.match?.explanation) body.appendChild(el("p", "why", result.match.explanation));
  if (result.criterion.requirement) body.appendChild(el("p", "requirement", result.criterion.requirement));
  body.appendChild(
    el(
      "p",
      "path",
      `${result.criterion.principle.num} ${result.criterion.principle.handle} / ` +
        `${result.criterion.guideline.num} ${result.criterion.guideline.handle} / ` +
        `WCAG ${result.criterion.versions.join(", ")}`
    )
  );
  if (result.techniques?.length) body.appendChild(techniqueChips(result.techniques));

  const foot = el("div", "rescard-foot");
  const understanding = el("a", "linkbtn", "W3C guidance");
  understanding.href = result.links.understanding;
  understanding.target = "_blank";
  understanding.rel = "noopener";
  foot.appendChild(understanding);
  foot.appendChild(inlineButton("coverage", `/v1/criteria/${result.criterion.id}/coverage`, body, renderCoverageDetail));
  foot.appendChild(inlineButton("related", `/v1/criteria/${result.criterion.id}/related`, body, renderRelatedDetail));
  body.appendChild(foot);

  card.appendChild(body);

  head.addEventListener("click", () => {
    const expanded = head.getAttribute("aria-expanded") === "true";
    head.setAttribute("aria-expanded", String(!expanded));
    body.hidden = expanded;
  });

  return card;
}

function inlineButton(label, url, container, renderer) {
  const button = el("button", "linkbtn", label);
  button.type = "button";
  button.setAttribute("aria-expanded", "false");

  button.addEventListener("click", async () => {
    const existing = container.querySelector(`[data-detail="${label}"]`);
    if (existing) {
      existing.remove();
      button.setAttribute("aria-expanded", "false");
      return;
    }

    button.setAttribute("aria-expanded", "true");
    try {
      const response = await fetch(url);
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error?.message || "Lookup failed.");
      const detail = renderer(payload.data);
      detail.dataset.detail = label;
      container.appendChild(detail);
    } catch (error) {
      const detail = el("div", "detail", error.message);
      detail.dataset.detail = label;
      container.appendChild(detail);
    }
  });

  return button;
}

function renderCoverageDetail(data) {
  const box = el("dl", "detail");
  box.appendChild(el("dt", null, "automated coverage"));
  box.appendChild(el("dd", null, `${data.coverage} — ${data.note}`));

  if (data.rules.length) {
    box.appendChild(el("dt", null, `checker rules (${data.rules.length})`));
    const dd = document.createElement("dd");
    dd.appendChild(techniqueChips(data.rules.map((rule) => ({ id: rule.id, technology: null }))));
    box.appendChild(dd);
  }
  return box;
}

function renderRelatedDetail(data) {
  const box = el("dl", "detail");
  box.appendChild(el("dt", null, "criteria sharing techniques"));

  if (!data.related.length) {
    box.appendChild(el("dd", null, "None. This criterion shares no techniques with any other."));
    return box;
  }

  for (const item of data.related.slice(0, 5)) {
    box.appendChild(
      el("dd", null, `${item.id} ${item.handle} (${item.level}) — ${item.sharedTechniques} shared`)
    );
  }
  return box;
}

const weakBox = $("#weak");
const weakList = $("#weak-list");
const weakToggle = $("#weak-toggle");
const weakLabel = $("#weak-label");

function resetWeak() {
  weakBox.hidden = true;
  weakList.hidden = true;
  weakToggle.setAttribute("aria-expanded", "false");
  clear(weakList);
}

weakToggle.addEventListener("click", () => {
  const expanded = weakToggle.getAttribute("aria-expanded") === "true";
  weakToggle.setAttribute("aria-expanded", String(!expanded));
  weakList.hidden = expanded;
});

/**
 * A low-confidence full text hit is a lead, not an answer, and the API says so.
 * Giving it the same visual weight as a phrase match is how a five-result
 * response starts feeling like noise, so weak matches are folded away behind a
 * count rather than dropped.
 */
function renderResultList(list) {
  resetWeak();

  const strong = list.filter((result) => result.match?.confidence !== "low");
  const weak = list.filter((result) => result.match?.confidence === "low");

  const shown = strong.length ? strong : list;
  const folded = strong.length ? weak : [];

  const ul = el("ul", "card-list");
  // Open the top result only. It is the answer; the rest are alternatives.
  shown.forEach((result, index) => ul.appendChild(criterionCard(result, { open: index === 0 })));
  results.appendChild(ul);

  if (!folded.length) return;

  weakBox.hidden = false;
  weakLabel.textContent =
    `${folded.length} weaker full text ${folded.length === 1 ? "match" : "matches"} — show`;
  for (const result of folded) weakList.appendChild(criterionCard(result));
}


/* ---------- live response viewer ----------
   The API is the product, so the sidebar shows the actual payload that
   produced whatever is on screen rather than a curl example that may or may
   not reflect what this build returns. */

const wireCall = $("#wire-call");
const wireJson = $("#wire-json");
const wireCopy = $("#wire-copy");
const wireNote = $("#wire-note");

const MAX_WIRE_CHARS = 60_000;
let wireText = "";

// Tokenises pretty-printed JSON and builds nodes. Done as DOM rather than
// markup so the strict CSP holds and no response content is ever parsed as
// HTML.
const JSON_TOKEN =
  /("(?:\\.|[^"\\])*")(\s*:)?|\b(true|false|null)\b|(-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)/g;

function highlight(json) {
  const fragment = document.createDocumentFragment();
  let last = 0;
  let match;

  JSON_TOKEN.lastIndex = 0;
  while ((match = JSON_TOKEN.exec(json)) !== null) {
    if (match.index > last) {
      fragment.appendChild(document.createTextNode(json.slice(last, match.index)));
    }

    const [whole, string, colon, literal, number] = match;

    if (string !== undefined) {
      fragment.appendChild(el("span", colon ? "j-key" : "j-str", string));
      if (colon) fragment.appendChild(document.createTextNode(colon));
    } else if (literal !== undefined) {
      fragment.appendChild(el("span", "j-lit", literal));
    } else {
      fragment.appendChild(el("span", "j-num", number));
    }

    last = match.index + whole.length;
  }

  if (last < json.length) fragment.appendChild(document.createTextNode(json.slice(last)));
  return fragment;
}

function showWire(call, payload, { status } = {}) {
  wireCall.textContent = call;

  let text;
  try {
    text = JSON.stringify(payload, null, 2);
  } catch {
    text = String(payload);
  }

  wireText = text;
  wireCopy.disabled = false;
  wireCopy.textContent = "copy";

  const truncated = text.length > MAX_WIRE_CHARS;
  const shown = truncated ? `${text.slice(0, MAX_WIRE_CHARS)}\n… truncated for display` : text;

  clear(wireJson);
  wireJson.classList.remove("wire-empty");
  wireJson.appendChild(highlight(shown));

  const bytes = new TextEncoder().encode(text).length;
  const size = bytes > 1024 ? `${(bytes / 1024).toFixed(1)} kB` : `${bytes} B`;
  wireNote.textContent =
    `${status ? `${status} · ` : ""}${size}${truncated ? " · display truncated, copy gives the full payload" : ""}`;

  $("#wire-body").scrollTop = 0;
}

wireCopy.addEventListener("click", async () => {
  try {
    await navigator.clipboard.writeText(wireText);
    wireCopy.textContent = "copied";
  } catch {
    wireCopy.textContent = "select and copy";
  }
  setTimeout(() => { wireCopy.textContent = "copy"; }, 1800);
});

/* ---------- request plumbing ---------- */

async function request(url, body) {
  setStatus("working", "busy");
  runButton.setAttribute("aria-disabled", "true");
  results.setAttribute("aria-busy", "true");
  clear(results);
  resetWeak();
  resultsScroll.scrollTop = 0;

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body)
    });
    const payload = await response.json();
    showWire(`POST ${url}`, payload, { status: `${response.status} ${response.ok ? "ok" : "error"}` });

    if (!response.ok) {
      setStatus(String(response.status), "error");
      setSummary(payload.error?.message || "The request was rejected.");
      if (payload.error?.details) {
        for (const [key, value] of Object.entries(payload.error.details)) {
          notice(`${key}: ${Array.isArray(value) ? value.join(" · ") : value}`, true);
        }
      }
      return null;
    }

    setStatus(`200 ok`, "ok");
    return payload.data;
  } catch {
    setStatus("network", "error");
    setSummary("Could not reach the API. Check your connection and run it again.");
    return null;
  } finally {
    runButton.removeAttribute("aria-disabled");
    results.removeAttribute("aria-busy");
  }
}

const filters = () => ({
  version: versionField.value,
  level: levelField.value || undefined
});

/* ---------- mode: plain language ---------- */

async function runText() {
  const query = $("#query").value.trim();
  if (!query) {
    setStatus("400", "error");
    setSummary("Nothing to translate. Describe what you are seeing.");
    return;
  }

  const data = await request("/v1/translate", { query, ...filters() });
  if (!data) return;

  setSummary(data.translation.summary);
  if (data.translation.results.length) renderResultList(data.translation.results);
}

/* ---------- mode: checker rule ids ---------- */

function ruleNotices(data) {
  for (const rule of data.rules) {
    if (rule.resolved === false) {
      const hint = rule.suggestions?.length ? ` Did you mean ${rule.suggestions.join(", ")}?` : "";
      notice(`${rule.rule} is not a rule id this service knows.${hint}`, true);
    } else if (rule.wcagMapped === false) {
      notice(`${rule.rule} is a best-practice check with no WCAG mapping. Failing it does not by itself indicate a WCAG failure.`);
    } else if (rule.excluded?.length) {
      for (const excluded of rule.excluded) {
        notice(`${rule.rule} also maps to ${excluded.criterion}, hidden because it is ${excluded.reason}.`);
      }
    }
  }
}

async function runRule() {
  const ids = $("#rule").value.split(",").map((id) => id.trim()).filter(Boolean);
  if (!ids.length) {
    setStatus("400", "error");
    setSummary("Paste a rule id, for example color-contrast.");
    return;
  }

  const data = await request("/v1/translate/rule", { rules: ids, ...filters() });
  if (!data) return;

  setSummary(data.translation.summary);
  ruleNotices(data);
  if (data.translation.results.length) renderResultList(data.translation.results);
}

/* ---------- mode: whole scanner report ---------- */

async function runReport() {
  const raw = $("#report").value.trim();
  if (!raw) {
    setStatus("400", "error");
    setSummary("Paste a scanner report, or load the sample.");
    return;
  }

  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    setStatus("400", "error");
    setSummary(`That is not valid JSON: ${error.message}`);
    return;
  }

  const data = await request("/v1/report", { report: parsed, ...filters() });
  if (!data) return;

  setSummary(data.translation.summary);
  notice(
    `Detected a ${data.report.format} report: ${data.report.findings} failing checks across ${data.report.occurrences} elements.` +
      (data.report.needsReview.length ? ` ${data.report.needsReview.length} need human review.` : "")
  );
  ruleNotices(data);
  if (data.translation.results.length) renderResultList(data.translation.results);
}

/* ---------- mode: direct lookup ---------- */

function definitionCard(title, subtitle, blocks) {
  const card = el("li", "rescard");
  const head = el("div", "rescard-head is-static");
  head.appendChild(el("span", "rescard-num", subtitle));
  head.appendChild(el("span", "rescard-title", title));
  card.appendChild(head);

  const body = el("div", "rescard-body deftext");
  for (const block of blocks) body.appendChild(block);
  card.appendChild(body);
  return card;
}

async function runLookup() {
  const term = $("#lookup").value.trim();
  if (!term) {
    setStatus("400", "error");
    setSummary("Enter a criterion number, technique id or glossary term.");
    return;
  }

  setStatus("working", "busy");
  results.setAttribute("aria-busy", "true");
  clear(results);
  resetWeak();
  resultsScroll.scrollTop = 0;

  // Criterion, technique and glossary namespaces do not overlap, so trying all
  // three and taking whatever answers is simpler and faster for the person
  // typing than making them pick a type first.
  const attempts = [
    { url: `/v1/criteria/${encodeURIComponent(term)}`, kind: "criterion" },
    { url: `/v1/techniques/${encodeURIComponent(term)}`, kind: "technique" },
    { url: `/v1/glossary/${encodeURIComponent(term)}`, kind: "glossary" }
  ];

  try {
    const responses = await Promise.all(
      attempts.map(async (attempt) => {
        const response = await fetch(attempt.url);
        return { ...attempt, ok: response.ok, payload: await response.json() };
      })
    );

    const hit = responses.find((response) => response.ok);

    if (!hit) {
      setStatus("404", "error");
      setSummary(`Nothing matched "${term}" as a criterion, technique or glossary term.`);
      const search = await fetch(`/v1/search?q=${encodeURIComponent(term)}&limit=5`);
      if (search.ok) {
        const { data } = await search.json();
        const near = [
          ...data.criteria.map((c) => `${c.id} ${c.handle}`),
          ...data.techniques.map((t) => t.id),
          ...data.glossary.map((g) => g.name)
        ].slice(0, 6);
        if (near.length) notice(`Closest matches: ${near.join(" · ")}`);
      }
      return;
    }

    setStatus("200 ok", "ok");
    showWire(`GET ${hit.url}`, hit.payload, { status: "200 ok" });
    const list = el("ul", "card-list");

    if (hit.kind === "criterion") {
      const criterion = hit.payload.data;
      setSummary(`WCAG ${criterion.num} ${criterion.handle}, level ${criterion.level}.`);
      list.appendChild(
        criterionCard({
          criterion: {
            id: criterion.num,
            handle: criterion.handle,
            requirement: criterion.requirement,
            level: criterion.level,
            versions: criterion.versions,
            guideline: criterion.guideline,
            principle: criterion.principle
          },
          match: null,
          techniques: criterion.techniques,
          links: criterion.links
        }, { open: true })
      );
    }

    if (hit.kind === "technique") {
      const technique = hit.payload.data;
      setSummary(`Technique ${technique.id}: ${technique.title}`);
      const blocks = [
        el("p", null, technique.title),
        el("p", "path", `${technique.technology || "unclassified"} · ${technique.categories.join(", ")}`),
        el("p", "path", `supports ${technique.criteria.join(", ")}`)
      ];
      if (technique.url) {
        const link = el("a", "linkbtn", "Read at W3C");
        link.href = technique.url;
        link.target = "_blank";
        link.rel = "noopener";
        blocks.push(link);
      }
      list.appendChild(definitionCard(technique.title, technique.id, blocks));
    }

    if (hit.kind === "glossary") {
      const entry = hit.payload.data;
      setSummary(`Glossary: ${entry.name}`);
      list.appendChild(
        definitionCard(entry.name, "glossary", [el("p", null, entry.derived?.text || "")])
      );
    }

    results.appendChild(list);
  } catch {
    setStatus("network", "error");
    setSummary("Could not reach the API.");
  } finally {
    results.removeAttribute("aria-busy");
  }
}

/* ---------- tabs ---------- */

/**
 * One controller for both tablists (input mode, and the context column).
 * `onSelect` is where the input list hangs its extra behaviour, so the context
 * list does not have to know that input modes exist.
 */
function wireTabs(list, onSelect) {
  const tabs = [...list.querySelectorAll('[role="tab"]')];

  const select = (tab, { focus = false } = {}) => {
    for (const candidate of tabs) {
      const selected = candidate === tab;
      candidate.setAttribute("aria-selected", String(selected));
      candidate.tabIndex = selected ? 0 : -1;
      document.getElementById(candidate.getAttribute("aria-controls")).hidden = !selected;
    }
    if (focus) tab.focus();
    if (onSelect) onSelect(tab);
  };

  tabs.forEach((tab, index) => {
    tab.addEventListener("click", () => select(tab));
    tab.addEventListener("keydown", (event) => {
      const offset = { ArrowRight: 1, ArrowLeft: -1, Home: -index, End: tabs.length - 1 - index }[event.key];
      if (offset === undefined) return;
      event.preventDefault();
      select(tabs[(index + offset + tabs.length) % tabs.length], { focus: true });
    });
  });

  select(tabs[0]);
}

wireTabs(document.querySelector('.tabs[aria-label="Input mode"]'), (tab) => {
  mode = tab.id.replace("tab-", "");
  modeNote.textContent = MODES[mode].note;
});

wireTabs(document.querySelector('.tabs[aria-label="Context"]'));

/* ---------- tooltips ----------
   Hover and keyboard focus are handled in CSS. This adds tap, which has
   neither, and Escape to dismiss. */

for (const button of document.querySelectorAll(".tip-btn")) {
  const body = document.getElementById(button.getAttribute("aria-describedby"));

  button.addEventListener("click", (event) => {
    event.stopPropagation();
    const open = body.dataset.open === "true";
    for (const other of document.querySelectorAll(".tip-body")) delete other.dataset.open;
    if (!open) body.dataset.open = "true";
  });
}

document.addEventListener("click", () => {
  for (const body of document.querySelectorAll(".tip-body")) delete body.dataset.open;
});

document.addEventListener("keydown", (event) => {
  if (event.key !== "Escape") return;
  for (const body of document.querySelectorAll(".tip-body")) delete body.dataset.open;
});

/* ---------- wiring ---------- */

runButton.addEventListener("click", () => MODES[mode].run());

for (const button of document.querySelectorAll("[data-example]")) {
  button.addEventListener("click", () => {
    $("#query").value = button.dataset.example;
    runText();
  });
}

for (const button of document.querySelectorAll("[data-rule]")) {
  button.addEventListener("click", () => {
    $("#rule").value = button.dataset.rule;
    runRule();
  });
}

for (const button of document.querySelectorAll("[data-lookup]")) {
  button.addEventListener("click", () => {
    $("#lookup").value = button.dataset.lookup;
    runLookup();
  });
}

for (const field of ["#rule", "#lookup"]) {
  $(field).addEventListener("keydown", (event) => {
    if (event.key !== "Enter") return;
    event.preventDefault();
    MODES[mode].run();
  });
}

$("#sample-axe").addEventListener("click", () => {
  const sample = {
    url: "https://example.com/checkout",
    violations: [
      { id: "color-contrast", impact: "serious", nodes: [{}, {}, {}, {}, {}, {}, {}] },
      { id: "button-name", impact: "critical", nodes: [{}, {}] },
      { id: "image-alt", impact: "critical", nodes: [{}, {}, {}] },
      { id: "link-name", impact: "serious", nodes: [{}] },
      { id: "region", impact: "moderate", nodes: [{}] }
    ],
    incomplete: [{ id: "aria-hidden-focus", nodes: [{}] }]
  };
  $("#report").value = JSON.stringify(sample, null, 2);
  runReport();
});

/* ---------- instance status strip ---------- */

async function loadStatus() {
  try {
    const response = await fetch("/v1/stats");
    if (!response.ok) return;
    const payload = await response.json();
    const { data } = payload;
    showWire("GET /v1/stats", payload, { status: "200 ok" });

    const figures = {
      "stat-criteria": data.criteria.total,
      "stat-techniques": data.techniques.total,
      "stat-glossary": data.glossary.total,
      "stat-phrases": data.developerVocabulary.phrases,
      "stat-rules": data.checkerRules.total
    };
    for (const [id, value] of Object.entries(figures)) {
      $(`#${id}`).textContent = String(value);
    }

    $("#stat-build").textContent =
      `WCAG ${data.dataset.versions.join("+")} · axe ${data.checkerRules.engines.axe.version} · ${data.dataset.checksum}`;

    renderCoverage(data.coverage);
  } catch {
    // The strip is context, not function. A failure here should not shout.
  }
}

function renderCoverage(coverage) {
  const total = coverage.total || 1;
  const segments = [
    [".seg-automated", coverage.automated],
    [".seg-assisted", coverage.assisted],
    [".seg-manual", coverage["manual-only"]]
  ];
  for (const [selector, value] of segments) {
    // setProperty on a custom property rather than .style.width: the strict
    // CSP blocks inline style, and this keeps the header intact.
    $(selector).style.setProperty("--seg", `${(value / total) * 100}%`);
  }

  $("#cov-automated").textContent = coverage.automated;
  $("#cov-assisted").textContent = coverage.assisted;
  $("#cov-manual").textContent = coverage["manual-only"];

  $("#coverage-meter").setAttribute(
    "aria-label",
    `Of ${total} success criteria, ${coverage.automated} have automated coverage, ` +
      `${coverage.assisted} are assisted only, and ${coverage["manual-only"]} can only be checked by a person.`
  );

  $("#coverage-note").textContent =
    `${coverage.automatedPercent}% of the ${total} indexed criteria have some automated coverage. ` +
    `Derived from the WCAG tags checkers publish for their own rules, so it describes what tooling looks at. What a page does is a separate question.`;
}

loadStatus();
