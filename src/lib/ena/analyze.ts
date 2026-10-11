/**
 * Classroom epistemic network analysis.
 *
 * Follows Shaffer, Collier, and Ruis (2016): binary codes, a moving window
 * inside one conversation, one network per student, spherical normalisation,
 * and a two-dimensional projection. A link is counted for the student who
 * wrote the current post when both ideas are in the window and at least one
 * of them is in that post, so the line always has a post the teacher can read.
 */

export type EnaPost = {
  id: number;
  authorId: number | null;
  authorName: string;
  message: string;
  createdAt: string | null;
};

export type EnaIdea = {
  id: string;
  label: string;
  terms: string[];
};

export type EnaWindow = 'post' | 'recent' | 'thread';

export type EnaFocus = { kind: 'all' } | { kind: 'student'; id: string };

export type EnaEvidence = {
  postId: number;
  authorName: string;
  createdAt: string | null;
  message: string;
  side: 'a' | 'b';
  context: { authorName: string; excerpt: string }[];
};

export type EnaEdge = {
  source: string;
  target: string;
  weight: number;
  signed: number;
  countA: number;
  countB: number;
  evidence: EnaEvidence[];
};

export type EnaPoint = { id: string; label: string; x: number; y: number };

export type EnaModel = {
  mode: 'class' | 'student' | 'difference';
  nameA: string;
  nameB: string | null;
  nodes: EnaPoint[];
  students: EnaPoint[];
  classMarker: { x: number; y: number } | null;
  edges: EnaEdge[];
  collapsed: boolean;
  placed: boolean;
  highlightA: string | null;
  highlightB: string | null;
};

const STOPWORDS = new Set([
  'about', 'above', 'after', 'again', 'against', 'also', 'although', 'always', 'among',
  'because', 'been', 'before', 'being', 'below', 'between', 'both', 'cannot', 'cant',
  'could', 'didnt', 'does', 'doesnt', 'doing', 'dont', 'down', 'during', 'each', 'else',
  'even', 'ever', 'every', 'from', 'further', 'gets', 'going', 'have', 'having', 'here',
  'into', 'itself', 'just', 'like', 'make', 'makes', 'many', 'maybe', 'might', 'more',
  'most', 'much', 'must', 'only', 'onto', 'other', 'ours', 'ourselves', 'over', 'really',
  'same', 'seem', 'seems', 'should', 'since', 'some', 'something', 'still', 'such',
  'than', 'that', 'their', 'theirs', 'them', 'themselves', 'then', 'there', 'these',
  'they', 'this', 'those', 'through', 'under', 'until', 'very', 'want', 'wants', 'were',
  'what', 'when', 'where', 'which', 'while', 'with', 'would', 'your', 'yours',
  'think', 'thinks', 'thought', 'feel', 'feels', 'feeling', 'people', 'person', 'thing',
  'things', 'well', 'good', 'also', 'just', 'like', 'used', 'using', 'course', 'class',
  'discussion', 'discuss', 'student', 'students', 'post', 'posts', 'reply', 'replies',
  'comment', 'comments', 'https', 'http', 'www', 'com', 'html', 'png', 'jpg', 'jpeg',
  'gif', 'webp', 'screenshot', 'show', 'shows', 'showing', 'shown', 'look', 'looks',
  'looking', 'seen', 'need', 'needs', 'know', 'knows', 'come', 'comes', 'came', 'take',
  'takes', 'give', 'gives', 'become', 'becomes', 'really', 'actually', 'something',
  'someone', 'everyone', 'always', 'often', 'another', 'around', 'without', 'within',
  'quite', 'almost', 'already', 'across', 'example', 'examples', 'different', 'means',
  'meaning', 'understand', 'understands', 'understanding', 'paired', 'pairing', 'easy',
]);

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function cleanText(text: string): string {
  return text
    .replace(/\[[^\]]*\]/g, ' ')
    .replace(/https?:\/\/\S+/g, ' ')
    .toLowerCase()
    .replace(/[^a-z0-9\s'-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function singularize(word: string): string {
  if (word.length > 5 && word.endsWith('ies')) return `${word.slice(0, -3)}y`;
  if (/(?:sis|ous|ess|ius|ss)$/.test(word)) return word;
  if (word.length >= 5 && word.endsWith('s')) return word.slice(0, -1);
  return word;
}

function wordParts(text: string): { word: string; keep: boolean }[] {
  return cleanText(text)
    .split(' ')
    .filter(Boolean)
    .map((word) => {
      const normalized = singularize(word.replace(/^'+|'+$/g, '').replace(/'s$/, ''));
      const keep =
        normalized.length >= 4 &&
        normalized.length <= 24 &&
        !STOPWORDS.has(normalized) &&
        !/\d/.test(normalized);
      return { word: normalized, keep };
    })
    .filter((part) => part.word.length > 0);
}

function contentWords(text: string): string[] {
  return wordParts(text).filter((part) => part.keep).map((part) => part.word);
}

export function suggestIdeas(posts: EnaPost[], prompt = ''): EnaIdea[] {
  const documents = posts.map((post) => wordParts(post.message));
  const n = documents.length;
  if (n === 0) return [];

  const unigramDf = new Map<string, number>();
  const bigramDf = new Map<string, number>();
  for (const parts of documents) {
    const words = parts.filter((part) => part.keep).map((part) => part.word);
    for (const word of new Set(words)) unigramDf.set(word, (unigramDf.get(word) ?? 0) + 1);
    const phrases = new Set<string>();
    for (let i = 0; i < parts.length - 1; i += 1) {
      if (parts[i].keep && parts[i + 1].keep) phrases.add(`${parts[i].word} ${parts[i + 1].word}`);
    }
    for (const phrase of phrases) bigramDf.set(phrase, (bigramDf.get(phrase) ?? 0) + 1);
  }

  const promptWords = new Set(contentWords(prompt));
  const mentionedInPrompt = (word: string) => {
    if (promptWords.has(word)) return true;
    for (const promptWord of promptWords) {
      if (promptWord.length < 4 || word.length < 4) continue;
      if (word.startsWith(promptWord) || promptWord.startsWith(word)) return true;
    }
    return false;
  };
  type Candidate = { label: string; df: number; score: number; parts: string[] };
  const candidates: Candidate[] = [];

  const keep = (label: string, df: number, parts: string[]) => {
    if (df < 2) return;
    if (df / n > 0.85) return;
    if (parts.every((part) => mentionedInPrompt(part)) && df / n > 0.55) return;
    const score = df * Math.log((n + 1) / df) * (parts.length === 2 ? 1.25 : 1);
    candidates.push({ label, df, score, parts });
  };

  for (const [label, df] of unigramDf) keep(label, df, [label]);
  for (const [label, df] of bigramDf) keep(label, df, label.split(' '));

  candidates.sort((a, b) => b.score - a.score || a.label.localeCompare(b.label));
  const chosen: Candidate[] = [];
  for (const candidate of candidates) {
    if (chosen.length >= 6) break;
    if (
      candidate.parts.length === 2 &&
      candidate.parts.every((part) => chosen.some((item) => item.label === part))
    ) {
      continue;
    }
    if (
      candidate.parts.length === 1 &&
      chosen.some(
        (item) => item.parts.length === 2 && item.parts.includes(candidate.label) && candidate.df <= item.df + 1,
      )
    ) {
      continue;
    }
    chosen.push(candidate);
  }

  const coveredByPhrase = (label: string, items: Candidate[]) =>
    items.some((item) => item.parts.length === 2 && item.parts.includes(label));
  let picked = chosen.filter((item) => item.parts.length === 2 || !coveredByPhrase(item.label, chosen));
  for (const candidate of candidates) {
    if (picked.length >= 6) break;
    if (picked.some((item) => item.label === candidate.label)) continue;
    if (candidate.parts.length === 1 && coveredByPhrase(candidate.label, picked)) continue;
    if (
      candidate.parts.length === 2 &&
      candidate.parts.every((part) => picked.some((item) => item.label === part))
    ) {
      continue;
    }
    picked.push(candidate);
  }

  return picked.slice(0, 6).map((item) => ({ id: item.label, label: item.label, terms: [item.label] }));
}

export function ideaFromPhrase(phrase: string): EnaIdea | null {
  const label = phrase.trim().toLowerCase().replace(/\s+/g, ' ');
  if (label.length < 2 || label.length > 40) return null;
  return { id: label, label, terms: [label] };
}

function postMatchesTerm(message: string, term: string): boolean {
  const needle = term.trim().toLowerCase();
  if (!needle) return false;
  if (needle.includes(' ')) return cleanText(message).includes(needle);
  const pattern = new RegExp(`\\b${escapeRegExp(needle)}(?:s|es)?\\b`, 'i');
  return pattern.test(message);
}

function postCodes(message: string, ideas: EnaIdea[]): boolean[] {
  return ideas.map((idea) => idea.terms.some((term) => postMatchesTerm(message, term)));
}

export function studentKey(post: { authorId: number | null; authorName: string }): string {
  return post.authorId != null ? `id:${post.authorId}` : `name:${post.authorName}`;
}

function orderedPosts(posts: EnaPost[]): EnaPost[] {
  return [...posts].sort((a, b) => {
    const ta = a.createdAt ? Date.parse(a.createdAt) : Number.NaN;
    const tb = b.createdAt ? Date.parse(b.createdAt) : Number.NaN;
    if (Number.isNaN(ta) && Number.isNaN(tb)) return a.id - b.id;
    if (Number.isNaN(ta)) return 1;
    if (Number.isNaN(tb)) return -1;
    return ta - tb || a.id - b.id;
  });
}

function windowStart(index: number, mode: EnaWindow): number {
  if (mode === 'thread') return 0;
  if (mode === 'post') return index;
  return Math.max(0, index - 3);
}

type UnitAccum = {
  id: string;
  name: string;
  raw: number[];
  evidence: EnaEvidence[][];
};

function pairIndex(i: number, j: number, n: number): number {
  const left = Math.min(i, j);
  const right = Math.max(i, j);
  return left * n - (left * (left + 1)) / 2 + (right - left - 1);
}

function emptyModel(nameA: string, nameB: string | null, mode: EnaModel['mode']): EnaModel {
  return {
    mode,
    nameA,
    nameB,
    nodes: [],
    students: [],
    classMarker: null,
    edges: [],
    collapsed: true,
    placed: false,
    highlightA: null,
    highlightB: null,
  };
}

function jacobiEigen(matrix: number[][]): { values: number[]; vectors: number[][] } {
  const n = matrix.length;
  const a = matrix.map((row) => row.slice());
  const vectors = Array.from({ length: n }, (_, row) =>
    Array.from({ length: n }, (_, col) => (row === col ? 1 : 0)),
  );

  for (let sweep = 0; sweep < 48; sweep += 1) {
    let off = 0;
    for (let p = 0; p < n; p += 1) {
      for (let q = p + 1; q < n; q += 1) off += a[p][q] * a[p][q];
    }
    if (off < 1e-12) break;

    for (let p = 0; p < n; p += 1) {
      for (let q = p + 1; q < n; q += 1) {
        const app = a[p][p];
        const aqq = a[q][q];
        const apq = a[p][q];
        if (Math.abs(apq) < 1e-15) continue;
        const tau = (aqq - app) / (2 * apq);
        const t =
          tau === 0 ? 1 : Math.sign(tau) / (Math.abs(tau) + Math.sqrt(1 + tau * tau));
        const c = 1 / Math.sqrt(1 + t * t);
        const s = t * c;
        a[p][p] = app - t * apq;
        a[q][q] = aqq + t * apq;
        a[p][q] = 0;
        a[q][p] = 0;
        for (let r = 0; r < n; r += 1) {
          if (r === p || r === q) continue;
          const arp = a[r][p];
          const arq = a[r][q];
          const nextP = c * arp - s * arq;
          const nextQ = s * arp + c * arq;
          a[r][p] = nextP;
          a[p][r] = nextP;
          a[r][q] = nextQ;
          a[q][r] = nextQ;
        }
        for (let r = 0; r < n; r += 1) {
          const vrp = vectors[r][p];
          const vrq = vectors[r][q];
          vectors[r][p] = c * vrp - s * vrq;
          vectors[r][q] = s * vrp + c * vrq;
        }
      }
    }
  }

  return { values: a.map((row, index) => row[index]), vectors };
}

function gaussian(matrix: number[][], target: number[]): number[] | null {
  const n = target.length;
  const a = matrix.map((row, index) => [...row, target[index]]);
  for (let col = 0; col < n; col += 1) {
    let pivot = col;
    for (let row = col + 1; row < n; row += 1) {
      if (Math.abs(a[row][col]) > Math.abs(a[pivot][col])) pivot = row;
    }
    if (Math.abs(a[pivot][col]) < 1e-10) return null;
    [a[col], a[pivot]] = [a[pivot], a[col]];
    const divisor = a[col][col];
    for (let colIndex = col; colIndex <= n; colIndex += 1) a[col][colIndex] /= divisor;
    for (let row = 0; row < n; row += 1) {
      if (row === col) continue;
      const factor = a[row][col];
      for (let colIndex = col; colIndex <= n; colIndex += 1) a[row][colIndex] -= factor * a[col][colIndex];
    }
  }
  return a.map((row) => row[n]);
}

function solveLeastSquares(rows: number[][], target: number[]): number[] | null {
  const k = rows[0]?.length ?? 0;
  if (rows.length === 0 || k === 0) return null;
  const ata = Array.from({ length: k }, () => Array(k).fill(0));
  const atb = Array(k).fill(0);
  for (let row = 0; row < rows.length; row += 1) {
    for (let i = 0; i < k; i += 1) {
      atb[i] += rows[row][i] * target[row];
      for (let j = 0; j < k; j += 1) ata[i][j] += rows[row][i] * rows[row][j];
    }
  }
  let trace = 0;
  for (let i = 0; i < k; i += 1) trace += ata[i][i];
  const ridge = Math.max(trace, 1) * 1e-6;
  for (let i = 0; i < k; i += 1) ata[i][i] += ridge;
  return gaussian(ata, atb);
}

function circlePositions(count: number): [number, number][] {
  return Array.from({ length: count }, (_, index) => {
    const angle = -Math.PI / 2 + (2 * Math.PI * index) / Math.max(count, 1);
    return [Math.cos(angle), Math.sin(angle)] as [number, number];
  });
}

function rotate(point: [number, number], angle: number): [number, number] {
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  return [c * point[0] + s * point[1], -s * point[0] + c * point[1]];
}

function excerpt(text: string, limit = 160): string {
  const flat = text.replace(/\s+/g, ' ').trim();
  if (flat.length <= limit) return flat;
  return `${flat.slice(0, limit - 1).trim()}…`;
}

export function buildEna(input: {
  posts: EnaPost[];
  ideas: EnaIdea[];
  window: EnaWindow;
  focus: EnaFocus;
  compare: EnaFocus | null;
}): EnaModel {
  const ideas = input.ideas;
  const n = ideas.length;
  const pairCount = (n * (n - 1)) / 2;
  const focusIsStudent = input.focus.kind === 'student';
  const compareIsStudent = input.compare?.kind === 'student';
  const sameStudent =
    focusIsStudent && compareIsStudent && input.compare?.kind === 'student' && input.focus.kind === 'student'
      ? input.focus.id === input.compare.id
      : false;
  const comparing = input.compare != null && input.compare.kind === 'student' && !sameStudent;
  const mode: EnaModel['mode'] = comparing ? 'difference' : focusIsStudent ? 'student' : 'class';

  const posts = orderedPosts(input.posts);
  const names = new Map<string, string>();
  for (const post of posts) names.set(studentKey(post), post.authorName);
  const nameA =
    input.focus.kind === 'student' ? names.get(input.focus.id) ?? 'This student' : 'All students';
  const nameB =
    comparing && input.compare?.kind === 'student'
      ? input.focus.kind === 'all'
        ? names.get(input.compare.id) ?? 'This student'
        : names.get(input.compare.id) ?? 'This student'
      : null;

  if (n < 2 || pairCount === 0 || posts.length === 0) return emptyModel(nameA, nameB, mode);

  const units = new Map<string, UnitAccum>();
  const ensure = (id: string, authorName: string) => {
    const existing = units.get(id);
    if (existing) return existing;
    const created: UnitAccum = {
      id,
      name: authorName,
      raw: Array(pairCount).fill(0),
      evidence: Array.from({ length: pairCount }, () => []),
    };
    units.set(id, created);
    return created;
  };

  const codes = posts.map((post) => postCodes(post.message, ideas));
  for (let index = 0; index < posts.length; index += 1) {
    const current = codes[index];
    if (!current.some(Boolean)) continue;
    const start = windowStart(index, input.window);
    const stanza = Array(n).fill(false);
    for (let cursor = start; cursor <= index; cursor += 1) {
      codes[cursor].forEach((present, code) => {
        if (present) stanza[code] = true;
      });
    }
    const unit = ensure(studentKey(posts[index]), posts[index].authorName);
    for (let left = 0; left < n; left += 1) {
      if (!stanza[left]) continue;
      for (let right = left + 1; right < n; right += 1) {
        if (!stanza[right]) continue;
        if (!current[left] && !current[right]) continue;
        const pair = pairIndex(left, right, n);
        unit.raw[pair] += 1;
        if (unit.evidence[pair].length >= 8) continue;
        const context: EnaEvidence['context'] = [];
        for (let cursor = start; cursor < index && context.length < 2; cursor += 1) {
          const earlier = codes[cursor];
          const mentions = (earlier[left] && !current[left]) || (earlier[right] && !current[right]);
          if (!mentions || !posts[cursor].message.trim()) continue;
          context.push({
            authorName: posts[cursor].authorName,
            excerpt: excerpt(posts[cursor].message),
          });
        }
        unit.evidence[pair].push({
          postId: posts[index].id,
          authorName: posts[index].authorName,
          createdAt: posts[index].createdAt,
          message: posts[index].message,
          side: 'a',
          context,
        });
      }
    }
  }

  const active = [...units.values()].filter((unit) => unit.raw.some((value) => value > 0));
  if (active.length === 0) return emptyModel(nameA, nameB, mode);

  const norm = (raw: number[]) => {
    const length = Math.hypot(...raw);
    return length > 0 ? raw.map((value) => value / length) : raw.slice();
  };
  const normalized = new Map(active.map((unit) => [unit.id, norm(unit.raw)]));

  const meanOf = (ids: string[]) => {
    const rows = ids.map((id) => normalized.get(id)).filter((row): row is number[] => row != null);
    if (rows.length === 0) return Array(pairCount).fill(0);
    return Array.from({ length: pairCount }, (_, pair) =>
      rows.reduce((sum, row) => sum + row[pair], 0) / rows.length,
    );
  };
  const sumOf = (ids: string[]) => {
    const set = new Set(ids);
    const totals = Array(pairCount).fill(0);
    for (const unit of active) {
      if (!set.has(unit.id)) continue;
      unit.raw.forEach((value, pair) => {
        totals[pair] += value;
      });
    }
    return totals;
  };

  const allIds = active.map((unit) => unit.id);
  const focusIds =
    input.focus.kind === 'student' ? allIds.filter((id) => id === input.focus.id) : allIds;
  const compareIds =
    input.compare?.kind === 'student' ? allIds.filter((id) => id === input.compare?.id) : [];

  let vectorA: number[];
  let vectorB: number[];
  let countsA: number[];
  let countsB: number[];
  let resolvedNameA = nameA;
  let resolvedNameB = nameB;
  let resolvedMode = mode;

  if (input.focus.kind === 'all' && input.compare?.kind === 'student') {
    const others = allIds.filter((id) => id !== input.compare?.id);
    vectorA = meanOf(compareIds);
    vectorB = meanOf(others);
    countsA = sumOf(compareIds);
    countsB = sumOf(others);
    resolvedNameA = names.get(input.compare.id) ?? 'This student';
    resolvedNameB = 'the rest of the class';
    resolvedMode = 'difference';
  } else if (input.focus.kind === 'student' && input.compare?.kind === 'student' && !sameStudent) {
    vectorA = meanOf(focusIds);
    vectorB = meanOf(compareIds);
    countsA = sumOf(focusIds);
    countsB = sumOf(compareIds);
    resolvedMode = 'difference';
  } else if (input.focus.kind === 'student') {
    vectorA = meanOf(focusIds);
    vectorB = Array(pairCount).fill(0);
    countsA = sumOf(focusIds);
    countsB = Array(pairCount).fill(0);
    resolvedMode = 'student';
    resolvedNameB = null;
  } else {
    vectorA = meanOf(allIds);
    vectorB = Array(pairCount).fill(0);
    countsA = sumOf(allIds);
    countsB = Array(pairCount).fill(0);
    resolvedMode = 'class';
    resolvedNameB = null;
  }

  const plotted = vectorA.map((value, pair) =>
    resolvedMode === 'difference' ? value - vectorB[pair] : value,
  );

  const groupFor = (id: string): 'a' | 'b' | null => {
    if (resolvedMode !== 'difference') return 'a';
    if (input.focus.kind === 'all' && input.compare?.kind === 'student') {
      return id === input.compare.id ? 'a' : 'b';
    }
    if (input.focus.kind === 'student' && focusIds.includes(id)) return 'a';
    if (compareIds.includes(id)) return 'b';
    return null;
  };

  const edges: EnaEdge[] = [];
  for (let left = 0; left < n; left += 1) {
    for (let right = left + 1; right < n; right += 1) {
      const pair = pairIndex(left, right, n);
      const signed = plotted[pair] ?? 0;
      if (Math.abs(signed) < 1e-8 && countsA[pair] === 0 && countsB[pair] === 0) continue;
      const evidence: EnaEvidence[] = [];
      for (const unit of active) {
        const side = groupFor(unit.id);
        if (side == null) continue;
        if (resolvedMode === 'student' && input.focus.kind === 'student' && unit.id !== input.focus.id) continue;
        for (const item of unit.evidence[pair]) evidence.push({ ...item, side });
      }
      evidence.sort((a, b) => {
        const ta = a.createdAt ? Date.parse(a.createdAt) : 0;
        const tb = b.createdAt ? Date.parse(b.createdAt) : 0;
        return ta - tb;
      });
      edges.push({
        source: ideas[left].id,
        target: ideas[right].id,
        weight: Math.abs(signed),
        signed,
        countA: countsA[pair] ?? 0,
        countB: countsB[pair] ?? 0,
        evidence,
      });
    }
  }
  edges.sort((a, b) => b.weight - a.weight || b.countA + b.countB - (a.countA + a.countB));

  const layoutUnits = active.filter((unit) => normalized.has(unit.id));
  let points = new Map<string, [number, number]>();
  let placed = false;
  let collapsed = true;

  if (layoutUnits.length >= 2 && pairCount >= 1) {
    const centered = layoutUnits.map((unit) => normalized.get(unit.id) ?? []);
    const means = Array.from({ length: pairCount }, (_, pair) =>
      centered.reduce((sum, row) => sum + row[pair], 0) / centered.length,
    );
    const xc = centered.map((row) => row.map((value, pair) => value - means[pair]));
    const cov = Array.from({ length: pairCount }, () => Array(pairCount).fill(0));
    for (const row of xc) {
      for (let i = 0; i < pairCount; i += 1) {
        for (let j = i; j < pairCount; j += 1) {
          cov[i][j] += row[i] * row[j];
          if (i !== j) cov[j][i] += row[i] * row[j];
        }
      }
    }
    const { values, vectors } = jacobiEigen(cov);
    const order = values
      .map((value, index) => ({ value, index }))
      .sort((a, b) => b.value - a.value);
    const scores = xc.map((row) => {
      const xy: [number, number] = [0, 0];
      for (let dim = 0; dim < 2; dim += 1) {
        const component = order[dim];
        if (!component || component.value <= 1e-8) continue;
        const column = component.index;
        for (let pair = 0; pair < pairCount; pair += 1) xy[dim] += row[pair] * vectors[pair][column];
      }
      return xy;
    });

    const spread = scores.reduce((max, point) => Math.max(max, Math.hypot(point[0], point[1])), 0);
    if (spread > 1e-6) {
      placed = true;
      collapsed = false;
      points = new Map(layoutUnits.map((unit, index) => [unit.id, scores[index]]));

      if (resolvedMode === 'difference') {
        const meanPoint = (ids: string[]) => {
          const rows = ids.map((id) => points.get(id)).filter((point): point is [number, number] => point != null);
          if (rows.length === 0) return null;
          return rows.reduce<[number, number]>((sum, point) => [sum[0] + point[0], sum[1] + point[1]], [0, 0])
            .map((value) => value / rows.length) as [number, number];
        };
        const idsA =
          input.focus.kind === 'all' && input.compare?.kind === 'student' ? compareIds : focusIds;
        const idsB =
          input.focus.kind === 'all' && input.compare?.kind === 'student'
            ? allIds.filter((id) => input.compare?.kind === 'student' && id !== input.compare.id)
            : compareIds;
        const meanA = meanPoint(idsA);
        const meanB = meanPoint(idsB);
        if (meanA && meanB) {
          const dx = meanA[0] - meanB[0];
          const dy = meanA[1] - meanB[1];
          if (Math.hypot(dx, dy) > 1e-6) {
            const angle = Math.atan2(dy, dx);
            points = new Map([...points.entries()].map(([id, point]) => [id, rotate(point, angle)]));
          }
        }
      }
    }
  }

  let nodeXY = circlePositions(n);
  if (placed) {
    const rows: number[][] = [];
    const bx: number[] = [];
    const by: number[] = [];
    for (const unit of layoutUnits) {
      const point = points.get(unit.id);
      const row = normalized.get(unit.id);
      if (!point || !row) continue;
      const degree = Array(n).fill(0);
      let strength = 0;
      for (let left = 0; left < n; left += 1) {
        for (let right = left + 1; right < n; right += 1) {
          const weight = row[pairIndex(left, right, n)] ?? 0;
          degree[left] += weight;
          degree[right] += weight;
          strength += weight;
        }
      }
      if (strength <= 1e-8) continue;
      rows.push(degree);
      bx.push(2 * strength * point[0]);
      by.push(2 * strength * point[1]);
    }
    const xs = solveLeastSquares(rows, bx);
    const ys = solveLeastSquares(rows, by);
    if (xs && ys) {
      const span = Math.max(...xs.map((value, index) => Math.hypot(value - xs[0], ys[index] - ys[0])), 0);
      if (span > 1e-4) nodeXY = xs.map((x, index) => [x, ys[index]] as [number, number]);
      else placed = false;
    } else placed = false;
    if (!placed) collapsed = true;
  }

  const students: EnaPoint[] = placed
    ? layoutUnits.map((unit) => {
        const point = points.get(unit.id) ?? [0, 0];
        return { id: unit.id, label: unit.name, x: point[0], y: point[1] };
      })
    : [];

  let classMarker: EnaModel['classMarker'] = null;
  if (placed && input.focus.kind === 'all' && input.compare?.kind === 'student') {
    const others = students.filter((student) => student.id !== input.compare?.id);
    if (others.length > 0) {
      classMarker = {
        x: others.reduce((sum, student) => sum + student.x, 0) / others.length,
        y: others.reduce((sum, student) => sum + student.y, 0) / others.length,
      };
    }
  }

  const highlightA =
    input.focus.kind === 'student'
      ? input.focus.id
      : input.compare?.kind === 'student'
        ? input.compare.id
        : null;
  const highlightB =
    input.focus.kind === 'student' && input.compare?.kind === 'student' && !sameStudent
      ? input.compare.id
      : null;

  return {
    mode: resolvedMode,
    nameA: resolvedNameA,
    nameB: resolvedNameB,
    nodes: ideas.map((idea, index) => ({
      id: idea.id,
      label: idea.label,
      x: nodeXY[index][0],
      y: nodeXY[index][1],
    })),
    students: placed ? students : [],
    classMarker: placed ? classMarker : null,
    edges,
    collapsed,
    placed,
    highlightA,
    highlightB,
  };
}

export function displayLabel(label: string): string {
  return label.replace(/\b[a-z]/g, (letter) => letter.toUpperCase());
}
