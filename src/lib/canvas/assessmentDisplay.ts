import { isRollCallAttendance, type AssessmentGradeRow, type LetterBucket } from './grades';

export function assessmentsForGradebook(assessments: AssessmentGradeRow[]): AssessmentGradeRow[] {
  return assessments
    .filter((row) => !isRollCallAttendance(row.name))
    .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));
}

export function gradeCountsForChart(row: AssessmentGradeRow): number[] {
  return (['A', 'B', 'C', 'D', 'F'] as LetterBucket[]).map((l) => row.grades[l]);
}
