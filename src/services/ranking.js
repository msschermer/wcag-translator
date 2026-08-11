// BM25 over the pre-built index.
//
// The previous scoring used `title.includes(token)`, which is substring
// matching: the token "id" scored a hit on "video", "aria" hit "criteria", and
// every long criterion outranked short ones because it simply contained more
// characters. BM25 fixes both problems - it weights rare terms above common
// ones and normalises for document length.

const K1 = 1.4; // term frequency saturation
const B = 0.6; // length normalisation strength

const FIELD_WEIGHTS = { title: 3.2, body: 1, context: 0.6 };

function termFrequency(tokens, term) {
  let count = 0;
  for (const token of tokens) if (token === term) count += 1;
  return count;
}

export function rank(queryTokens, searchIndex, type, { limit = 10 } = {}) {
  if (!queryTokens.length) return [];

  const docs = searchIndex.docs.filter((doc) => doc.type === type);
  const N = searchIndex.counts[type] || docs.length || 1;
  const avgdl = searchIndex.avgLength[type] || 1;
  const df = searchIndex.df[type] || {};

  const results = [];

  for (const doc of docs) {
    const length =
      doc.fields.title.length + doc.fields.body.length + doc.fields.context.length;
    let score = 0;
    const matched = [];

    for (const term of queryTokens) {
      const n = df[term] || 0;
      if (!n) continue;

      const idf = Math.log(1 + (N - n + 0.5) / (n + 0.5));

      let weighted = 0;
      for (const [field, weight] of Object.entries(FIELD_WEIGHTS)) {
        weighted += weight * termFrequency(doc.fields[field], term);
      }
      if (!weighted) continue;

      matched.push(term);
      score +=
        idf * ((weighted * (K1 + 1)) / (weighted + K1 * (1 - B + B * (length / avgdl))));
    }

    if (score <= 0) continue;

    // Reward covering more of the query rather than hammering one rare term.
    const coverage = matched.length / queryTokens.length;
    results.push({ ref: doc.ref, score: score * (0.55 + 0.45 * coverage), matched });
  }

  return results.sort((a, b) => b.score - a.score).slice(0, limit);
}

// Maps a raw BM25 score onto a stable 0-1 relevance value so the API can
// publish it without leaking the scoring implementation to clients.
export function relevance(score) {
  return Math.round((1 - Math.exp(-score / 6)) * 1000) / 1000;
}
