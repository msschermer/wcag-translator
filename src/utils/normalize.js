// Text normalisation helpers.
//
// Important: nothing in here is ever written back over W3C source content.
// The original `content` HTML is preserved verbatim in the generated data set
// (the W3C terms of use require that the content is not changed). These helpers
// only produce clearly-labelled derived fields used for search and display.

export function stripHtml(value = "") {
  return String(value)
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#0?39;|&apos;/gi, "'")
    .replace(/\s+/g, " ")
    .trim();
}

export function normalizeText(value = "") {
  return stripHtml(value)
    .toLowerCase()
    .replace(/[^a-z0-9.\s-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const STOP_WORDS = new Set([
  "a", "an", "the", "and", "or", "but", "for", "with", "that", "this", "from",
  "into", "have", "has", "had", "does", "do", "not", "are", "is", "was", "were",
  "be", "been", "my", "our", "your", "their", "its", "it", "can", "cant", "how",
  "why", "what", "when", "where", "which", "who", "on", "in", "of", "to", "at",
  "by", "as", "if", "so", "we", "i", "you", "there", "here", "get", "got",
  "some", "any", "all", "no", "yes", "just", "very", "really", "seem", "seems"
]);

export function isStopWord(token) {
  return STOP_WORDS.has(token);
}

// Deliberately conservative suffix stripping. Full Porter stemming mangles
// domain vocabulary ("aria" -> "ari", "focus" -> "focu") and hurts precision
// more than the extra recall is worth on a corpus this small.
export function stem(token = "") {
  if (token.length <= 3) return token;

  let t = token;

  // Plurals first.
  if (/[^aeiou]ies$/.test(t)) t = `${t.slice(0, -3)}y`;
  else if (/(sses|shes|ches|xes|zes)$/.test(t)) t = t.slice(0, -2);
  else if (/[^s]s$/.test(t)) t = t.slice(0, -1);

  // Then verb endings.
  if (/[^e]ing$/.test(t) && t.length > 5) t = t.slice(0, -3);
  else if (/[^e]ed$/.test(t) && t.length > 4) t = t.slice(0, -2);

  // Undouble a consonant exposed by the strip: "trapped" -> "trapp" -> "trap".
  // ss, ll and zz are left alone, since they are usually part of the root.
  if (/([^aeiousl])\1$/.test(t) && t.length > 3) t = t.slice(0, -1);

  // Then a trailing silent e, so "announce" and "announced" land on the same
  // stem. This has to run after the rules above rather than instead of them,
  // otherwise "image" and "images" diverge.
  if (t.length > 4 && t.endsWith("e")) t = t.slice(0, -1);

  return t;
}

export function tokenize(value = "", { keepStopWords = false } = {}) {
  return normalizeText(value)
    .split(/[\s.]+/)
    .filter((token) => token.length > 1)
    .filter((token) => keepStopWords || !STOP_WORDS.has(token))
    .map(stem);
}

export function unique(values = []) {
  return [...new Set(values.filter(Boolean))];
}

// Accepts "1.4.3", "SC 1.4.3", "WCAG 1.4.3", "wcag-1.4.3", "contrast-minimum".
export function canonicalCriterionId(value = "") {
  return String(value)
    .trim()
    .replace(/^wcag[\s-]*/i, "")
    .replace(/^sc[\s-]*/i, "")
    .trim();
}
