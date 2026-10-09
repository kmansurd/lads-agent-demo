import type { AssessmentGradeRow, LetterBucket } from './grades';

export function hasClearWeighting(weighting: string): boolean {
  return /\d+(\.\d+)?%/.test(weighting);
}

/** Featured: rubric attached and a computed % weight toward the final grade. */
export function isFeaturedAssessment(row: AssessmentGradeRow): boolean {
  return row.usesRubric && hasClearWeighting(row.weighting);
}

export function partitionAssessments(assessments: AssessmentGradeRow[]): {
  featured: AssessmentGradeRow[];
  other: AssessmentGradeRow[];
  sorted: AssessmentGradeRow[];
} {
  const featured = assessments.filter(isFeaturedAssessment);
  const other = assessments.filter((a) => !isFeaturedAssessment(a));
  const byName = (a: AssessmentGradeRow, b: AssessmentGradeRow) =>
    a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });
  featured.sort(byName);
  other.sort(byName);
  return { featured, other, sorted: [...featured, ...other] };
}

export function gradeCountsForChart(row: AssessmentGradeRow): number[] {
  return (['A', 'B', 'C', 'D', 'F'] as LetterBucket[]).map((l) => row.grades[l]);
}
