function normalize(text) {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9àâäéèêëïîôùûüç]/g, ' ')
    .trim();
}

function tokenize(text) {
  return new Set(
    normalize(text)
      .split(/\s+/)
      .filter((w) => w.length > 2),
  );
}

export function similarity(a, b) {
  const ta = tokenize(a);
  const tb = tokenize(b);
  if (!ta.size || !tb.size) return 0;
  let intersection = 0;
  for (const t of ta) {
    if (tb.has(t)) intersection++;
  }
  return intersection / (ta.size + tb.size - intersection);
}

export function deduplicate(articles, existingTitles = []) {
  const seen = existingTitles.map((t) => normalize(t));
  const result = [];

  for (const article of articles) {
    const norm = normalize(article.title || '');
    const isDup = seen.some((s) => similarity(norm, s) > 0.6);
    if (!isDup) {
      seen.push(norm);
      result.push(article);
    }
  }

  return result;
}

// Union-Find cluster detection. Articles with similarity > 0.5 are merged into clusters.
// A cluster of 3+ articles escalates the criticality to 'breaking'.
export function detectAndAnnotateClusters(articles) {
  const n = articles.length;
  const parent = Array.from({ length: n }, (_, i) => i);

  function find(i) {
    if (parent[i] !== i) parent[i] = find(parent[i]);
    return parent[i];
  }

  function union(i, j) {
    parent[find(i)] = find(j);
  }

  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      if (similarity(articles[i].title || '', articles[j].title || '') > 0.5) {
        union(i, j);
      }
    }
  }

  const clusters = new Map();
  for (let i = 0; i < n; i++) {
    const root = find(i);
    if (!clusters.has(root)) clusters.set(root, []);
    clusters.get(root).push(i);
  }

  for (const [, members] of clusters) {
    const clusterId = articles[members[0]].title?.slice(0, 40) ?? `cluster-${members[0]}`;
    const clusterSize = members.length;
    for (const idx of members) {
      articles[idx].cluster_id = clusterId;
      articles[idx].cluster_size = clusterSize;
      if (clusterSize >= 3 && articles[idx].criticality !== 'breaking') {
        articles[idx].criticality = 'breaking';
      }
    }
  }

  return articles;
}
