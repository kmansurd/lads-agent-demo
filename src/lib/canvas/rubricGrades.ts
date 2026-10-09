import type { LetterBucket } from './letterScale';
import { scoreToLetter } from './letterScale';

export type CanvasRubricRating = {
  id: string | number;
  points?: number;
  description?: string;
};

export type CanvasRubricCriterion = {
  id: string | number;
  points?: number;
  ratings?: CanvasRubricRating[];
};

export type CanvasRubric = {
  points_possible?: number;
  criteria?: CanvasRubricCriterion[];
};

export type RubricAssessmentRow = {
  criterion_id?: string | number;
  points?: number | null;
  rating_id?: string | number | null;
};

export type RubricAssessment = {
  points?: number | null;
  score?: number | null;
  data?: RubricAssessmentRow[];
};

export type GradedSubmission = {
  grade?: string | null;
  score?: number | null;
  graded_at?: string | null;
  workflow_state?: string;
  rubric_assessment?: RubricAssessment | null;
};

const LETTER_ORD: Record<LetterBucket, number> = { A: 4, B: 3, C: 2, D: 1, F: 0 };

export function parseLetterToken(raw: string | null | undefined): LetterBucket | null {
  if (!raw) return null;
  const match = raw.trim().match(/\b([ABCDF])(?:\+|-)?\b/i);
  if (!match) return null;
  const letter = match[1].toUpperCase();
  if (letter === 'A' || letter === 'B' || letter === 'C' || letter === 'D' || letter === 'F') {
    return letter;
  }
  return null;
}

function rubricPointsPossible(rubric: CanvasRubric): number {
  if (rubric.points_possible != null && rubric.points_possible > 0) {
    return rubric.points_possible;
  }
  return (rubric.criteria ?? []).reduce((sum, c) => sum + (c.points ?? 0), 0);
}

function buildRatingLookup(rubric: CanvasRubric): Map<string, CanvasRubricRating> {
  const map = new Map<string, CanvasRubricRating>();
  for (const criterion of rubric.criteria ?? []) {
    for (const rating of criterion.ratings ?? []) {
      map.set(String(rating.id), rating);
    }
  }
  return map;
}

function sumAssessmentPoints(assessment: RubricAssessment): number | null {
  if (assessment.points != null && !Number.isNaN(assessment.points)) {
    return assessment.points;
  }
  if (assessment.score != null && !Number.isNaN(assessment.score)) {
    return assessment.score;
  }
  const rows = assessment.data ?? [];
  if (rows.length === 0) return null;
  let sum = 0;
  let any = false;
  for (const row of rows) {
    if (row.points != null && !Number.isNaN(row.points)) {
      sum += row.points;
      any = true;
    }
  }
  return any ? sum : null;
}

function criterionById(rubric: CanvasRubric, criterionId: string | number | undefined) {
  if (criterionId == null) return undefined;
  return rubric.criteria?.find((c) => String(c.id) === String(criterionId));
}

/** Each criterion must have a selected rubric level (rating or points). */
export function isRubricAssessmentComplete(
  rubric: CanvasRubric,
  assessment: RubricAssessment,
): boolean {
  const criteria = rubric.criteria ?? [];
  if (criteria.length === 0) return false;
  const rows = assessment.data ?? [];
  if (rows.length === 0) return false;

  return criteria.every((criterion) => {
    const row = rows.find((r) => String(r.criterion_id) === String(criterion.id));
    if (!row) return false;
    if (row.rating_id != null && String(row.rating_id).length > 0) return true;
    return row.points != null && !Number.isNaN(row.points);
  });
}

/**
 * Derive a letter from rubric criterion levels: prefer explicit A–F in rating
 * descriptions; otherwise map each criterion's earned points to a letter and
 * weight by criterion max points.
 */
export function letterFromRubricLevels(
  rubric: CanvasRubric,
  assessment: RubricAssessment,
): LetterBucket | null {
  if (!isRubricAssessmentComplete(rubric, assessment)) return null;

  const ratingLookup = buildRatingLookup(rubric);
  let weightSum = 0;
  let weightedOrd = 0;

  for (const criterion of rubric.criteria ?? []) {
    const row = (assessment.data ?? []).find(
      (r) => String(r.criterion_id) === String(criterion.id),
    );
    if (!row) return null;

    const weight = criterion.points ?? 1;
    let letter: LetterBucket | null = null;

    if (row.rating_id != null) {
      const rating = ratingLookup.get(String(row.rating_id));
      letter = parseLetterToken(rating?.description);
      if (!letter && rating?.points != null && (criterion.points ?? 0) > 0) {
        const pct = (rating.points / (criterion.points ?? 1)) * 100;
        letter = scoreToLetter(pct);
      }
    }

    if (!letter && row.points != null && (criterion.points ?? 0) > 0) {
      const pct = (row.points / (criterion.points ?? 1)) * 100;
      letter = scoreToLetter(pct);
    }

    if (!letter) return null;
    weightSum += weight;
    weightedOrd += LETTER_ORD[letter] * weight;
  }

  if (weightSum <= 0) return null;
  const avg = weightedOrd / weightSum;
  if (avg >= 3.5) return 'A';
  if (avg >= 2.5) return 'B';
  if (avg >= 1.5) return 'C';
  if (avg >= 0.5) return 'D';
  return 'F';
}

export function letterFromRubricPoints(
  rubric: CanvasRubric,
  assessment: RubricAssessment,
): LetterBucket | null {
  const earned = sumAssessmentPoints(assessment);
  if (earned == null) return null;
  const possible = rubricPointsPossible(rubric);
  if (possible <= 0) return null;
  return scoreToLetter((earned / possible) * 100);
}

export function resolveGradedSubmissionLetter(
  sub: GradedSubmission,
  assignmentPointsPossible: number,
  rubric: CanvasRubric | null,
): LetterBucket | null {
  const letterFromGrade = parseLetterToken(sub.grade);
  if (letterFromGrade && (sub.graded_at || sub.workflow_state === 'graded')) {
    return letterFromGrade;
  }

  if (rubric && sub.rubric_assessment) {
    const fromLevels = letterFromRubricLevels(rubric, sub.rubric_assessment);
    if (fromLevels) return fromLevels;
    if (isRubricAssessmentComplete(rubric, sub.rubric_assessment)) {
      const fromPoints = letterFromRubricPoints(rubric, sub.rubric_assessment);
      if (fromPoints) return fromPoints;
    }
  }

  const hasNumericGrade =
    sub.score != null &&
    !Number.isNaN(sub.score) &&
    (sub.graded_at != null || sub.workflow_state === 'graded');

  if (hasNumericGrade) {
    const possible = assignmentPointsPossible;
    const pct = possible > 0 ? (sub.score! / possible) * 100 : sub.score!;
    return scoreToLetter(pct);
  }

  return null;
}
