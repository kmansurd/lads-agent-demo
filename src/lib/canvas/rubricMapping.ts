import type {
  AssessmentGradeRow,
  GradebookCriterion,
  GradebookOutcome,
  GradebookRating,
} from './grades';
import type { LetterBucket } from './letterScale';

export const LETTERS: LetterBucket[] = ['A', 'B', 'C', 'D', 'F'];

const LETTER_ORD: Record<LetterBucket, number> = { A: 4, B: 3, C: 2, D: 1, F: 0 };

export type GradeScale = 'letter' | 'percent';

export type RatingMatch = {
  letter: LetterBucket | '';
  start: string;
  end: string;
};

export type RatingMatchMap = Record<string, RatingMatch>;

export type PercentRange = {
  start: number;
  end: number;
  label: string;
};

export function emptyMatch(): RatingMatch {
  return { letter: '', start: '', end: '' };
}

export function formatPercent(value: number): string {
  return Number.isInteger(value) ? String(value) : String(Math.round(value * 10) / 10);
}

export function rangeLabel(start: number, end: number): string {
  return `${formatPercent(start)}–${formatPercent(end)}%`;
}

export function parseRange(match: RatingMatch | undefined): { start: number; end: number } | null {
  if (!match) return null;
  if (match.start.trim() === '' || match.end.trim() === '') return null;
  const start = Number(match.start);
  const end = Number(match.end);
  if (!Number.isFinite(start) || !Number.isFinite(end)) return null;
  if (start < 0 || end > 100 || start > end) return null;
  return { start, end };
}

export function collectRanges(map: RatingMatchMap): PercentRange[] {
  const seen = new Map<string, PercentRange>();
  for (const match of Object.values(map)) {
    const range = parseRange(match);
    if (!range) continue;
    const label = rangeLabel(range.start, range.end);
    if (!seen.has(label)) seen.set(label, { ...range, label });
  }
  return [...seen.values()].sort((a, b) => a.start - b.start || a.end - b.end);
}

export function courseCriteria(rows: AssessmentGradeRow[]): GradebookCriterion[] {
  const byKey = new Map<string, GradebookCriterion>();
  for (const row of rows) {
    for (const criterion of row.criteria) {
      const existing = byKey.get(criterion.key);
      if (!existing) {
        byKey.set(criterion.key, {
          ...criterion,
          ratings: [...criterion.ratings],
        });
        continue;
      }
      if (!existing.scored && criterion.scored) existing.scored = true;
      const known = new Set(existing.ratings.map((rating) => rating.key));
      for (const rating of criterion.ratings) {
        if (known.has(rating.key)) continue;
        existing.ratings.push(rating);
        known.add(rating.key);
      }
      existing.ratings.sort(
        (a, b) => (b.points ?? -1) - (a.points ?? -1) || a.label.localeCompare(b.label),
      );
    }
  }
  return [...byKey.values()].sort((a, b) => a.description.localeCompare(b.description));
}

/** Same identity as the rubric catalog, so a typed name matches the rating already on assignments. */
export function ratingIdentityKey(label: string): string {
  return label.toLowerCase().replace(/\s*\/\s*/g, '/').replace(/\s+/g, ' ').trim();
}

/** Unique rating names from published-assignment rubrics. The same name is one match. */
export function mappingRatings(criteria: GradebookCriterion[]): GradebookRating[] {
  const byKey = new Map<string, GradebookRating>();
  for (const criterion of criteria) {
    for (const rating of criterion.ratings) {
      const existing = byKey.get(rating.key);
      if (!existing) {
        byKey.set(rating.key, { ...rating });
        continue;
      }
      if ((rating.points ?? -1) > (existing.points ?? -1)) {
        existing.points = rating.points;
        existing.label = rating.label;
      }
    }
  }
  return [...byKey.values()].sort(
    (a, b) => (b.points ?? -1) - (a.points ?? -1) || a.label.localeCompare(b.label),
  );
}

function scoredWeight(row: AssessmentGradeRow, criterionKey: string): number | null {
  const criterion = row.criteria.find((item) => item.key === criterionKey);
  if (!criterion?.scored) return null;
  return criterion.points > 0 ? criterion.points : 1;
}

function mappedRatings(outcome: GradebookOutcome, row: AssessmentGradeRow): [string, string][] {
  return Object.entries(outcome.ratings).filter(([criterionKey]) => scoredWeight(row, criterionKey) != null);
}

export function assignmentUsesMatch(
  row: AssessmentGradeRow,
  map: RatingMatchMap,
  scale: GradeScale,
): boolean {
  if (row.criteria.length === 0) return false;
  for (const outcome of row.outcomes) {
    for (const [, ratingKey] of mappedRatings(outcome, row)) {
      if (scale === 'letter' && map[ratingKey]?.letter) return true;
      if (scale === 'percent' && parseRange(map[ratingKey])) return true;
    }
  }
  return false;
}

export function studentLetter(
  row: AssessmentGradeRow,
  outcome: GradebookOutcome,
  map: RatingMatchMap,
): LetterBucket | null {
  let weightSum = 0;
  let weighted = 0;
  for (const [criterionKey, ratingKey] of mappedRatings(outcome, row)) {
    const letter = map[ratingKey]?.letter;
    if (!letter) continue;
    const weight = scoredWeight(row, criterionKey) ?? 0;
    weightSum += weight;
    weighted += LETTER_ORD[letter] * weight;
  }
  if (weightSum <= 0) return null;
  return letterFromOrdinal(weighted / weightSum);
}

function letterFromOrdinal(avg: number): LetterBucket {
  if (avg >= 3.5) return 'A';
  if (avg >= 2.5) return 'B';
  if (avg >= 1.5) return 'C';
  if (avg >= 0.5) return 'D';
  return 'F';
}

function finalWeight(row: AssessmentGradeRow): number {
  if (typeof row.gradeWeight === 'number' && Number.isFinite(row.gradeWeight)) {
    return row.gradeWeight > 0 ? row.gradeWeight : 0;
  }
  const match = /^(\d+(?:\.\d+)?)%$/.exec(row.weighting.trim());
  if (!match) return 0;
  const value = Number(match[1]);
  return Number.isFinite(value) && value > 0 ? value : 0;
}

function outcomeKey(outcome: GradebookOutcome, index: number): string {
  return outcome.userId != null ? `user:${outcome.userId}` : `index:${index}`;
}

/** Per-student course grade from assignment weights. Ungraded and non-final assignments are left out. */
function overallByStudent(
  rows: AssessmentGradeRow[],
  valueFor: (row: AssessmentGradeRow, outcome: GradebookOutcome) => number | null,
): Map<string, number> | null {
  const counted = rows.filter((row) => finalWeight(row) > 0);
  if (counted.length === 0) return new Map();
  const missingIds = counted.some((row) => row.outcomes.some((outcome) => outcome.userId == null));
  const sameLength = counted.every((row) => row.outcomes.length === counted[0].outcomes.length);
  if (missingIds && !sameLength) return null;

  const totals = new Map<string, { weight: number; weighted: number }>();
  for (const row of counted) {
    const weight = finalWeight(row);
    row.outcomes.forEach((outcome, index) => {
      const value = valueFor(row, outcome);
      if (value == null) return;
      const key = outcomeKey(outcome, index);
      const slot = totals.get(key) ?? { weight: 0, weighted: 0 };
      slot.weight += weight;
      slot.weighted += value * weight;
      totals.set(key, slot);
    });
  }

  const averages = new Map<string, number>();
  for (const [key, slot] of totals) {
    if (slot.weight > 0) averages.set(key, slot.weighted / slot.weight);
  }
  return averages;
}

export function overallLetterCounts(
  rows: AssessmentGradeRow[],
  map: RatingMatchMap,
): { counts: number[]; graded: number } | null {
  const averages = overallByStudent(rows, (row, outcome) => {
    const letter = assignmentUsesMatch(row, map, 'letter')
      ? studentLetter(row, outcome, map)
      : outcome.postedLetter;
    return letter ? LETTER_ORD[letter] : null;
  });
  if (!averages) return null;
  const buckets: Record<LetterBucket, number> = { A: 0, B: 0, C: 0, D: 0, F: 0 };
  for (const avg of averages.values()) buckets[letterFromOrdinal(avg)] += 1;
  return { counts: LETTERS.map((letter) => buckets[letter]), graded: averages.size };
}

export function overallPercentCounts(
  rows: AssessmentGradeRow[],
  map: RatingMatchMap,
  ranges: PercentRange[],
): { counts: number[]; graded: number; outside: number } | null {
  const averages = overallByStudent(rows, (row, outcome) => studentPercent(row, outcome, map));
  if (!averages) return null;
  const counts = ranges.map(() => 0);
  const index = new Map(ranges.map((range, i) => [range.label, i]));
  let outside = 0;
  for (const avg of averages.values()) {
    const range = rangeForPercent(avg, ranges);
    if (!range) {
      outside += 1;
      continue;
    }
    counts[index.get(range.label) ?? 0] += 1;
  }
  return { counts, graded: averages.size - outside, outside };
}

export function studentPercent(
  row: AssessmentGradeRow,
  outcome: GradebookOutcome,
  map: RatingMatchMap,
): number | null {
  if (row.criteria.length === 0) return outcome.postedPercent;
  let weightSum = 0;
  let weighted = 0;
  for (const [criterionKey, ratingKey] of mappedRatings(outcome, row)) {
    const range = parseRange(map[ratingKey]);
    if (!range) continue;
    const weight = scoredWeight(row, criterionKey) ?? 0;
    weightSum += weight;
    weighted += ((range.start + range.end) / 2) * weight;
  }
  if (weightSum <= 0) return null;
  return weighted / weightSum;
}

export function rangeForPercent(value: number, ranges: PercentRange[]): PercentRange | null {
  const hits = ranges.filter((range) => value >= range.start && value <= range.end);
  if (hits.length === 0) return null;
  hits.sort((a, b) => a.end - a.start - (b.end - b.start) || a.start - b.start);
  return hits[0];
}

export function letterColumnCounts(
  row: AssessmentGradeRow,
  map: RatingMatchMap,
): { counts: number[]; notGraded: number } {
  const buckets: Record<LetterBucket, number> = { A: 0, B: 0, C: 0, D: 0, F: 0 };
  let notGraded = 0;
  const mapped = assignmentUsesMatch(row, map, 'letter');
  for (const outcome of row.outcomes) {
    const letter = mapped ? studentLetter(row, outcome, map) : outcome.postedLetter;
    if (!letter) {
      notGraded += 1;
      continue;
    }
    buckets[letter] += 1;
  }
  return { counts: LETTERS.map((letter) => buckets[letter]), notGraded };
}

export function percentColumnCounts(
  row: AssessmentGradeRow,
  map: RatingMatchMap,
  ranges: PercentRange[],
): { counts: number[]; notGraded: number } {
  const counts = ranges.map(() => 0);
  let notGraded = 0;
  const index = new Map(ranges.map((range, i) => [range.label, i]));
  for (const outcome of row.outcomes) {
    const percent = studentPercent(row, outcome, map);
    if (percent == null || ranges.length === 0) {
      notGraded += 1;
      continue;
    }
    const range = rangeForPercent(percent, ranges);
    if (!range) {
      notGraded += 1;
      continue;
    }
    counts[index.get(range.label) ?? 0] += 1;
  }
  return { counts, notGraded };
}

export function binScores(scores: number[], ranges: PercentRange[]): number[] {
  const counts = ranges.map(() => 0);
  const index = new Map(ranges.map((range, i) => [range.label, i]));
  for (const score of scores) {
    const range = rangeForPercent(score, ranges);
    if (!range) continue;
    counts[index.get(range.label) ?? 0] += 1;
  }
  return counts;
}

/** How many times this rating was used. Null when the assignment has no such criterion. */
export function ratingCount(
  row: AssessmentGradeRow,
  criterionKey: string,
  ratingKey: string,
): number | null {
  if (!row.criteria.some((criterion) => criterion.key === criterionKey)) return null;
  let count = 0;
  for (const outcome of row.outcomes) {
    if (outcome.ratings[criterionKey] === ratingKey) count += 1;
  }
  return count;
}
