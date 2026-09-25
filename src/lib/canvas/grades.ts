import { fetchAllPages, mapPool } from './client';

export type LetterBucket = 'A' | 'B' | 'C' | 'D' | 'F';

export function scoreToLetter(score: number | null | undefined): LetterBucket | null {
  if (score == null || Number.isNaN(score)) return null;
  if (score >= 90) return 'A';
  if (score >= 80) return 'B';
  if (score >= 70) return 'C';
  if (score >= 60) return 'D';
  return 'F';
}

function emptyBuckets(): Record<LetterBucket, number> {
  return { A: 0, B: 0, C: 0, D: 0, F: 0 };
}

type CanvasEnrollment = {
  type?: string;
  role?: string;
  grades?: {
    current_score?: number | null;
    final_score?: number | null;
    current_grade?: string | null;
  };
};

type CanvasUser = {
  id: number;
  name?: string;
  enrollments?: CanvasEnrollment[];
};

type CanvasAssignment = {
  id: number;
  name: string;
  points_possible?: number;
  published?: boolean;
  omit_from_final_grade?: boolean;
  assignment_group_id?: number;
  submission_types?: string[];
};

type CanvasAssignmentGroup = {
  id: number;
  name: string;
  group_weight?: number;
};

type CanvasSubmission = {
  user_id: number;
  score?: number | null;
  workflow_state?: string;
  excused?: boolean;
};

export type AssessmentGradeRow = {
  name: string;
  weighting: string;
  grades: Record<LetterBucket, number>;
};

export type CourseGradesPayload = {
  distribution: {
    labels: LetterBucket[];
    counts: number[];
  };
  formative: AssessmentGradeRow[];
  summative: AssessmentGradeRow[];
};

export async function getCourseGrades(courseId: string): Promise<CourseGradesPayload> {
  const [users, assignments, groups] = await Promise.all([
    fetchAllPages<CanvasUser>(`/courses/${courseId}/users`, {
      'enrollment_type[]': 'student',
      'include[]': 'enrollments',
    }),
    fetchAllPages<CanvasAssignment>(`/courses/${courseId}/assignments`, {
      'include[]': ['submission', 'score_statistics'],
    }),
    fetchAllPages<CanvasAssignmentGroup>(`/courses/${courseId}/assignment_groups`),
  ]);

  const courseBuckets = emptyBuckets();
  for (const user of users) {
    const enrollment = user.enrollments?.find(
      (e) => e.type === 'StudentEnrollment' || e.role === 'StudentEnrollment',
    );
    const score =
      enrollment?.grades?.current_score ?? enrollment?.grades?.final_score ?? null;
    const letter = scoreToLetter(score);
    if (letter) courseBuckets[letter] += 1;
  }

  const groupWeight = new Map(groups.map((g) => [g.id, g.group_weight ?? 0]));
  const groupName = new Map(groups.map((g) => [g.id, g.name]));

  const publishedAssignments = assignments.filter((a) => a.published !== false);

  const assignmentRows = await mapPool(publishedAssignments, 5, async (assignment) => {
    let submissions: CanvasSubmission[] = [];
    try {
      submissions = await fetchAllPages<CanvasSubmission>(
        `/courses/${courseId}/assignments/${assignment.id}/submissions`,
        { 'include[]': 'user' },
      );
    } catch {
      submissions = [];
    }

    const buckets = emptyBuckets();
    const points = assignment.points_possible ?? 0;

    for (const sub of submissions) {
      if (sub.excused || sub.workflow_state === 'unsubmitted') continue;
      if (sub.score == null) continue;
      const pct = points > 0 ? (sub.score / points) * 100 : sub.score;
      const letter = scoreToLetter(pct);
      if (letter) buckets[letter] += 1;
    }

    const weight = groupWeight.get(assignment.assignment_group_id ?? -1) ?? 0;
    const weightLabel = weight > 0 ? `${weight}%` : '—';
    const gName = groupName.get(assignment.assignment_group_id ?? -1) ?? '';

    return {
      name: assignment.name,
      weighting: weightLabel,
      groupName: gName,
      grades: buckets,
      isDiscussion: assignment.submission_types?.includes('discussion_topic'),
    };
  });

  const formative: AssessmentGradeRow[] = [];
  const summative: AssessmentGradeRow[] = [];

  for (const row of assignmentRows) {
    const entry = {
      name: row.name,
      weighting: row.weighting,
      grades: row.grades,
    };
    const lower = row.groupName.toLowerCase();
    if (
      lower.includes('formative') ||
      lower.includes('quiz') ||
      row.isDiscussion ||
      (row.weighting !== '—' && parseFloat(row.weighting) < 15)
    ) {
      formative.push(entry);
    } else {
      summative.push(entry);
    }
  }

  if (formative.length === 0 && summative.length === 0) {
    for (const row of assignmentRows) {
      summative.push({
        name: row.name,
        weighting: row.weighting,
        grades: row.grades,
      });
    }
  }

  return {
    distribution: {
      labels: ['A', 'B', 'C', 'D', 'F'],
      counts: ['A', 'B', 'C', 'D', 'F'].map((l) => courseBuckets[l as LetterBucket]),
    },
    formative: formative.slice(0, 15),
    summative: summative.slice(0, 15),
  };
}
