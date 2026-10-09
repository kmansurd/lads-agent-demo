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
};

export type AssessmentGradeRow = {
  id: number;
  name: string;
  weighting: string;
  grades: Record<LetterBucket, number>;
  notGraded: number;
  usesRubric: boolean;
};

export type CourseGradesPayload = {
  distribution: {
    labels: LetterBucket[];
    counts: number[];
    studentsWithGrade: number;
  };
  assessments: AssessmentGradeRow[];
  weightingNote: string;
};

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
  for (const user of users) {
    const enrollment = user.enrollments?.find(
      (e) => e.type === 'StudentEnrollment' || e.role === 'StudentEnrollment',
    );
    const letter =
      parseEnrollmentLetter(enrollment?.grades?.current_grade) ??
      scoreToLetter(
        enrollment?.grades?.current_score ?? enrollment?.grades?.final_score,
      );
    if (letter) {
      courseBuckets[letter] += 1;
      studentsWithGrade += 1;
    }
  }

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
    };
  });

  const weightingNote = applyGroupWeights
    ? 'Weighting uses Canvas assignment groups (group weight × share of points within the group).'
    : 'Weighting is proportional to points possible (this course does not use weighted assignment groups).';

  return {
    distribution: {
      labels: ['A', 'B', 'C', 'D', 'F'],
      counts: ['A', 'B', 'C', 'D', 'F'].map((l) => courseBuckets[l as LetterBucket]),
      studentsWithGrade,
    },
    assessments: assignmentRows,
    weightingNote,
  };
}
