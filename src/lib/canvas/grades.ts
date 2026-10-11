import { canvasRequest, fetchAllPages, mapPool } from './client';
import {
  type CanvasRubric,
  type GradedSubmission,
  parseLetterToken,
  resolveGradedSubmissionLetter,
} from './rubricGrades';
import { type LetterBucket, scoreToLetter } from './letterScale';

export type { LetterBucket } from './letterScale';
export { scoreToLetter } from './letterScale';

function parseEnrollmentLetter(raw: string | null | undefined): LetterBucket | null {
  return parseLetterToken(raw);
}

function emptyBuckets(): Record<LetterBucket, number> {
  return { A: 0, B: 0, C: 0, D: 0, F: 0 };
}

type CanvasCourse = {
  apply_assignment_group_weights?: boolean;
};

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
};

type CanvasAssignmentDetail = CanvasAssignment & {
  rubric?: CanvasRubric[] | CanvasRubric | null;
};

type CanvasAssignmentGroup = {
  id: number;
  name: string;
  group_weight?: number;
};

type CanvasSubmission = GradedSubmission & {
  user_id: number;
  excused?: boolean;
  late?: boolean;
  missing?: boolean;
  submitted_at?: string | null;
};

export type SubmissionStatusCounts = {
  submitted: number;
  late: number;
  missing: number;
  excused: number;
};

export type AssessmentGradeRow = {
  id: number;
  name: string;
  weighting: string;
  grades: Record<LetterBucket, number>;
  notGraded: number;
  usesRubric: boolean;
  submissionStatus: SubmissionStatusCounts;
};

export type GradebookKpi = {
  studentsEnrolled: number;
  studentsWithGrade: number;
  percentWithGrade: number | null;
  medianScore: number | null;
};

export const GRADEBOOK_DATA_SOURCES = [
  'GET /courses/:id/enrollments',
  'GET /courses/:id/assignments',
  'GET /courses/:id/assignments/:id/submissions',
  'GET /courses/:id/assignment_groups',
] as const;

export type CourseGradesPayload = {
  kpi: GradebookKpi;
  distribution: {
    labels: LetterBucket[];
    counts: number[];
    studentsWithGrade: number;
  };
  assessments: AssessmentGradeRow[];
  weightingNote: string;
  dataSources: string[];
};

function isSubmissionTurnedIn(sub: CanvasSubmission | undefined): boolean {
  if (!sub) return false;
  if (sub.submitted_at) return true;
  const state = sub.workflow_state;
  return state === 'submitted' || state === 'graded' || state === 'pending_review';
}

function countSubmissionStatuses(
  studentIds: number[],
  subByUser: Map<number, CanvasSubmission>,
): SubmissionStatusCounts {
  const counts: SubmissionStatusCounts = {
    submitted: 0,
    late: 0,
    missing: 0,
    excused: 0,
  };

  for (const studentId of studentIds) {
    const sub = subByUser.get(studentId);
    if (sub?.excused) {
      counts.excused += 1;
      continue;
    }
    if (sub?.missing === true || !isSubmissionTurnedIn(sub)) {
      counts.missing += 1;
      continue;
    }
    if (sub!.late) {
      counts.late += 1;
    } else {
      counts.submitted += 1;
    }
  }

  return counts;
}

function medianScore(scores: number[]): number | null {
  if (scores.length === 0) return null;
  const sorted = [...scores].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 0) {
    return Math.round((sorted[mid - 1] + sorted[mid]) / 2);
  }
  return Math.round(sorted[mid]);
}

function pickAssignmentRubric(detail: CanvasAssignmentDetail): CanvasRubric | null {
  const raw = detail.rubric;
  if (!raw) return null;
  if (Array.isArray(raw)) return raw[0] ?? null;
  return raw;
}

function buildAssignmentsByGroup(assignments: CanvasAssignment[]): Map<number, CanvasAssignment[]> {
  const map = new Map<number, CanvasAssignment[]>();
  for (const a of assignments) {
    if (a.published === false || a.omit_from_final_grade) continue;
    const gid = a.assignment_group_id ?? 0;
    const list = map.get(gid) ?? [];
    list.push(a);
    map.set(gid, list);
  }
  return map;
}

function formatAssignmentWeight(
  assignment: CanvasAssignment,
  groups: CanvasAssignmentGroup[],
  byGroup: Map<number, CanvasAssignment[]>,
  allGradedAssignments: CanvasAssignment[],
  applyGroupWeights: boolean,
): string {
  if (assignment.omit_from_final_grade) {
    return 'Not in final grade';
  }

  const points = assignment.points_possible ?? 0;
  const groupId = assignment.assignment_group_id ?? 0;
  const group = groups.find((g) => g.id === groupId);

  if (applyGroupWeights) {
    const groupWeight = group?.group_weight ?? 0;
    if (groupWeight <= 0) {
      return group?.name ? `${group.name} (0% group)` : `${points} pts`;
    }
    const inGroup = byGroup.get(groupId) ?? [];
    const groupPoints = inGroup.reduce((sum, a) => sum + (a.points_possible ?? 0), 0);
    if (groupPoints <= 0) {
      return `${groupWeight}% group`;
    }
    const share = (points / groupPoints) * groupWeight;
    return `${share.toFixed(1)}%`;
  }

  const coursePoints = allGradedAssignments.reduce((sum, a) => sum + (a.points_possible ?? 0), 0);
  if (coursePoints <= 0) {
    return `${points} pts`;
  }
  return `${((points / coursePoints) * 100).toFixed(1)}%`;
}

export async function getCourseGrades(courseId: string): Promise<CourseGradesPayload> {
  const [course, users, assignments, groups] = await Promise.all([
    canvasRequest<CanvasCourse>(`/courses/${courseId}`),
    fetchAllPages<CanvasUser>(`/courses/${courseId}/users`, {
      'enrollment_type[]': 'student',
      'include[]': 'enrollments',
    }),
    fetchAllPages<CanvasAssignment>(`/courses/${courseId}/assignments`),
    fetchAllPages<CanvasAssignmentGroup>(`/courses/${courseId}/assignment_groups`),
  ]);

  const studentIds = users.map((u) => u.id);
  const applyGroupWeights = course.apply_assignment_group_weights === true;

  const publishedAssignments = assignments.filter((a) => a.published !== false);
  const gradedAssignments = publishedAssignments.filter((a) => !a.omit_from_final_grade);
  const byGroup = buildAssignmentsByGroup(publishedAssignments);

  const courseBuckets = emptyBuckets();
  let studentsWithGrade = 0;
  const numericScores: number[] = [];
  for (const user of users) {
    const enrollment = user.enrollments?.find(
      (e) => e.type === 'StudentEnrollment' || e.role === 'StudentEnrollment',
    );
    const score = enrollment?.grades?.current_score ?? enrollment?.grades?.final_score;
    if (score != null && Number.isFinite(score)) {
      numericScores.push(score);
    }
    const letter =
      parseEnrollmentLetter(enrollment?.grades?.current_grade) ??
      scoreToLetter(score);
    if (letter) {
      courseBuckets[letter] += 1;
      studentsWithGrade += 1;
    }
  }

  const studentsEnrolled = studentIds.length;
  const kpi: GradebookKpi = {
    studentsEnrolled,
    studentsWithGrade,
    percentWithGrade:
      studentsEnrolled > 0
        ? Math.round((studentsWithGrade / studentsEnrolled) * 100)
        : null,
    medianScore: medianScore(numericScores),
  };

  const assignmentRows = await mapPool(publishedAssignments, 5, async (assignment) => {
    let rubric: CanvasRubric | null = null;
    try {
      const detail = await canvasRequest<CanvasAssignmentDetail>(
        `/courses/${courseId}/assignments/${assignment.id}`,
        { 'include[]': 'rubric' },
      );
      rubric = pickAssignmentRubric(detail);
    } catch {
      rubric = null;
    }

    let submissions: CanvasSubmission[] = [];
    try {
      submissions = await fetchAllPages<CanvasSubmission>(
        `/courses/${courseId}/assignments/${assignment.id}/submissions`,
        { 'include[]': 'rubric_assessment' },
      );
    } catch {
      submissions = [];
    }

    const subByUser = new Map(submissions.map((s) => [s.user_id, s]));
    const submissionStatus = countSubmissionStatuses(studentIds, subByUser);
    const buckets = emptyBuckets();
    let notGraded = 0;
    const points = assignment.points_possible ?? 0;

    for (const studentId of studentIds) {
      const sub = subByUser.get(studentId);
      if (sub?.excused) continue;

      const letter = sub
        ? resolveGradedSubmissionLetter(sub, points, rubric)
        : null;

      if (!letter) {
        notGraded += 1;
        continue;
      }
      buckets[letter] += 1;
    }

    return {
      id: assignment.id,
      name: assignment.name,
      weighting: formatAssignmentWeight(
        assignment,
        groups,
        byGroup,
        gradedAssignments,
        applyGroupWeights,
      ),
      grades: buckets,
      notGraded,
      usesRubric: rubric != null,
      submissionStatus,
    };
  });

  const weightingNote = applyGroupWeights
    ? 'Weighting uses Canvas assignment groups (group weight × share of points within the group).'
    : 'Weighting is proportional to points possible (this course does not use weighted assignment groups).';

  return {
    kpi,
    distribution: {
      labels: ['A', 'B', 'C', 'D', 'F'],
      counts: ['A', 'B', 'C', 'D', 'F'].map((l) => courseBuckets[l as LetterBucket]),
      studentsWithGrade,
    },
    assessments: assignmentRows,
    weightingNote,
    dataSources: [...GRADEBOOK_DATA_SOURCES],
  };
}
