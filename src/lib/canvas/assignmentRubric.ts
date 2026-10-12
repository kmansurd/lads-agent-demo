import { assignRating, criteriaFromRubric } from './rubricCatalog';
import { canvasRequest, fetchAllPages } from './client';

export type RubricComment = {
  studentName: string;
  text: string;
  markerName: string;
};

export type RubricCriterionSummary = {
  id: string;
  description: string;
  pointsPossible: number;
  ignoreForScoring: boolean;
  averagePoints: number | null;
  gradedCount: number;
  ratings: { label: string; count: number }[];
  ratingCountsByKey: Record<string, number>;
  totalRatingCount: number;
  comments: RubricComment[];
  commentCount: number;
};

export type AssignmentRubricDetail = {
  assignmentId: number;
  assignmentName: string;
  hasRubric: boolean;
  source: 'assignment' | 'quiz' | null;
  pointsPossible: number | null;
  rubricPointsPossible: number | null;
  postedAverage: number | null;
  postedCount: number;
  rubricAverage: number | null;
  rubricCount: number;
  scoresDiffer: number;
  criteria: RubricCriterionSummary[];
  markers: { name: string; role: string; count: number }[];
  comments: RubricComment[];
  commentCount: number;
};

type CanvasCriterion = {
  id?: string | number;
  description?: string;
  points?: number;
  ignore_for_scoring?: boolean;
  ratings?: { id?: string | number; description?: string; points?: number }[];
};

type CanvasAssignmentDetail = {
  id: number;
  name?: string;
  points_possible?: number;
  quiz_id?: number | null;
  is_quiz_assignment?: boolean;
  anonymous_grading?: boolean;
  anonymize_students?: boolean;
  rubric?: CanvasCriterion[] | null;
  rubric_settings?: { id?: number; points_possible?: number } | null;
};

type CanvasComment = {
  author_id?: number;
  author_name?: string;
  comment?: string;
};

type CanvasSubmission = {
  id: number;
  user_id: number;
  score?: number | null;
  grader_id?: number | null;
  user?: { id?: number; name?: string };
  rubric_assessment?: unknown;
  submission_comments?: CanvasComment[];
};

type CanvasRubricAssessment = {
  artifact_id?: number;
  artifact_type?: string;
  assessment_type?: string;
  assessor_id?: number | null;
  score?: number | null;
  data?: {
    criterion_id?: string | number;
    points?: number | null;
    comments?: string | null;
    description?: string | null;
  }[];
};

type CanvasRubricRecord = {
  data?: CanvasCriterion[];
  assessments?: CanvasRubricAssessment[];
  points_possible?: number;
};

type CanvasEnrollment = {
  user_id?: number;
  type?: string;
  user?: { name?: string };
};

type CriterionMark = {
  criterionId: string;
  points: number | null;
  ratingId: string | null;
  comments: string;
};

type StudentMarks = {
  userId: number;
  name: string;
  submissionId: number | null;
  postedScore: number | null;
  graderId: number | null;
  assessorId: number | null;
  marks: CriterionMark[];
  rubricScore: number | null;
  staffComments: { authorId: number; authorName: string; text: string }[];
};

const COMMENT_LIMIT = 8;
const CRITERION_COMMENT_LIMIT = 4;

function stripHtml(value: string): string {
  return value
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

function average(values: number[]): number | null {
  if (values.length === 0) return null;
  return round1(values.reduce((sum, value) => sum + value, 0) / values.length);
}

function roleLabel(type: string | undefined): string {
  if (type === 'TeacherEnrollment') return 'Teacher';
  if (type === 'TaEnrollment') return 'TA';
  if (type === 'DesignerEnrollment') return 'Designer';
  return 'Staff';
}

function marksFromUnknown(raw: unknown): CriterionMark[] {
  if (!raw || typeof raw !== 'object') return [];
  const record = raw as Record<string, unknown>;
  if (Array.isArray(record.data)) {
    return record.data.flatMap((row) => {
      if (!row || typeof row !== 'object') return [];
      const item = row as {
        criterion_id?: string | number;
        points?: number | null;
        rating_id?: string | number | null;
        comments?: string | null;
      };
      if (item.criterion_id == null) return [];
      return [
        {
          criterionId: String(item.criterion_id),
          points: typeof item.points === 'number' ? item.points : null,
          ratingId: item.rating_id != null ? String(item.rating_id) : null,
          comments: typeof item.comments === 'string' ? item.comments : '',
        },
      ];
    });
  }

  const marks: CriterionMark[] = [];
  for (const [key, value] of Object.entries(record)) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) continue;
    const row = value as {
      points?: number | null;
      rating_id?: string | number | null;
      comments?: string | null;
      criterion_id?: string | number;
    };
    const hasContent = row.points != null || row.rating_id != null || Boolean(row.comments);
    if (!hasContent) continue;
    marks.push({
      criterionId: String(row.criterion_id ?? key),
      points: typeof row.points === 'number' ? row.points : null,
      ratingId: row.rating_id != null ? String(row.rating_id) : null,
      comments: typeof row.comments === 'string' ? row.comments : '',
    });
  }
  return marks;
}

function isQuizAssignment(assignment: CanvasAssignmentDetail): boolean {
  return assignment.quiz_id != null || assignment.is_quiz_assignment === true;
}

async function fetchQuizSubmissions(courseId: string, quizId: number) {
  const rows: { submission_id?: number; user_id?: number }[] = [];
  for (let page = 1; page <= 20; page += 1) {
    const body = await canvasRequest<{ quiz_submissions?: { submission_id?: number; user_id?: number }[] }>(
      `/courses/${courseId}/quizzes/${quizId}/submissions`,
      { page: String(page), per_page: '100' },
    );
    const batch = body.quiz_submissions ?? [];
    rows.push(...batch);
    if (batch.length < 100) break;
  }
  return rows;
}

function emptyDetail(assignment: CanvasAssignmentDetail): AssignmentRubricDetail {
  return {
    assignmentId: assignment.id,
    assignmentName: assignment.name ?? 'Assignment',
    hasRubric: false,
    source: null,
    pointsPossible: assignment.points_possible ?? null,
    rubricPointsPossible: null,
    postedAverage: null,
    postedCount: 0,
    rubricAverage: null,
    rubricCount: 0,
    scoresDiffer: 0,
    criteria: [],
    markers: [],
    comments: [],
    commentCount: 0,
  };
}

export async function getAssignmentRubricDetail(
  courseId: string,
  assignmentId: string,
): Promise<AssignmentRubricDetail> {
  const assignment = await canvasRequest<CanvasAssignmentDetail>(
    `/courses/${courseId}/assignments/${assignmentId}`,
    { 'include[]': 'rubric' },
  );

  const [submissions, staffEnrollments] = await Promise.all([
    fetchAllPages<CanvasSubmission>(`/courses/${courseId}/assignments/${assignmentId}/submissions`, {
      'include[]': ['rubric_assessment', 'submission_comments', 'user'],
    }).catch(() => [] as CanvasSubmission[]),
    fetchAllPages<CanvasEnrollment>(`/courses/${courseId}/enrollments`, {
      'type[]': ['TeacherEnrollment', 'TaEnrollment'],
    }).catch(() => [] as CanvasEnrollment[]),
  ]);

  const staff = new Map<number, { name: string; role: string }>();
  for (const enrollment of staffEnrollments) {
    if (enrollment.user_id == null) continue;
    const role = roleLabel(enrollment.type);
    const existing = staff.get(enrollment.user_id);
    if (!existing || role === 'Teacher') {
      staff.set(enrollment.user_id, { name: enrollment.user?.name ?? 'Staff', role });
    }
  }

  const hideNames = assignment.anonymous_grading === true || assignment.anonymize_students === true;
  const students = new Map<number, StudentMarks>();
  for (const submission of submissions) {
    students.set(submission.user_id, {
      userId: submission.user_id,
      name: hideNames ? 'A student' : submission.user?.name || 'Student',
      submissionId: submission.id,
      postedScore: typeof submission.score === 'number' ? submission.score : null,
      graderId: submission.grader_id ?? null,
      assessorId: null,
      marks: marksFromUnknown(submission.rubric_assessment),
      rubricScore: null,
      staffComments: (submission.submission_comments ?? []).flatMap((comment) => {
        const text = stripHtml(comment.comment ?? '');
        if (!text || comment.author_id == null) return [];
        if (comment.author_id === submission.user_id) return [];
        if (staff.size > 0 && !staff.has(comment.author_id)) return [];
        return [{ authorId: comment.author_id, authorName: comment.author_name || 'Staff', text }];
      }),
    });
  }

  let criteria = assignment.rubric ?? [];
  let rubricPointsPossible = assignment.rubric_settings?.points_possible ?? null;
  let source: AssignmentRubricDetail['source'] = criteria.length > 0 ? 'assignment' : null;
  const rubricId = assignment.rubric_settings?.id;
  const needsQuizMarks =
    isQuizAssignment(assignment) && [...students.values()].every((student) => student.marks.length === 0);

  if (rubricId != null && (criteria.length > 0 || needsQuizMarks)) {
    const full = await canvasRequest<CanvasRubricRecord>(
      `/courses/${courseId}/rubrics/${rubricId}`,
      { 'include[]': 'assessments', style: 'full' },
    ).catch(() => null);

    if (full) {
      if (criteria.length === 0 && Array.isArray(full.data) && full.data.length > 0) {
        criteria = full.data;
        source = 'quiz';
      }
      if (rubricPointsPossible == null && full.points_possible != null) {
        rubricPointsPossible = full.points_possible;
      }

      const userByArtifact = new Map<number, number>();
      for (const student of students.values()) {
        if (student.submissionId != null) userByArtifact.set(student.submissionId, student.userId);
      }
      if (needsQuizMarks && assignment.quiz_id != null) {
        const quizSubmissions = await fetchQuizSubmissions(courseId, assignment.quiz_id).catch(() => []);
        for (const quizSubmission of quizSubmissions) {
          if (quizSubmission.submission_id != null && quizSubmission.user_id != null) {
            userByArtifact.set(quizSubmission.submission_id, quizSubmission.user_id);
          }
        }
      }

      for (const assessment of full.assessments ?? []) {
        if (assessment.assessment_type && assessment.assessment_type !== 'grading') continue;
        if (assessment.artifact_id == null) continue;
        const userId = userByArtifact.get(assessment.artifact_id);
        if (userId == null) continue;
        const student = students.get(userId);
        if (!student) continue;
        if (assessment.assessor_id != null) student.assessorId = assessment.assessor_id;
        if (typeof assessment.score === 'number') student.rubricScore = assessment.score;
        if (student.marks.length === 0 && Array.isArray(assessment.data) && assessment.data.length > 0) {
          student.marks = assessment.data.map((row) => ({
            criterionId: String(row.criterion_id ?? ''),
            points: typeof row.points === 'number' ? row.points : null,
            ratingId: null,
            comments: typeof row.comments === 'string' ? row.comments : '',
          }));
          if (source !== 'assignment' || needsQuizMarks) source = 'quiz';
        }
      }
    }
  }

  if (criteria.length === 0) return emptyDetail(assignment);

  const scoredCriteria = criteria.filter((criterion) => criterion.ignore_for_scoring !== true);
  if (rubricPointsPossible == null) {
    rubricPointsPossible = scoredCriteria.reduce((sum, criterion) => sum + (criterion.points ?? 0), 0);
  }

  for (const student of students.values()) {
    if (student.rubricScore != null) continue;
    const scoredIds = new Set(scoredCriteria.map((criterion) => String(criterion.id)));
    const points = student.marks
      .filter((mark) => scoredIds.has(mark.criterionId) && mark.points != null)
      .map((mark) => mark.points as number);
    if (points.length > 0) student.rubricScore = round1(points.reduce((sum, value) => sum + value, 0));
  }

  const posted = [...students.values()]
    .map((student) => student.postedScore)
    .filter((score): score is number => score != null);
  const rubricTotals = [...students.values()]
    .map((student) => student.rubricScore)
    .filter((score): score is number => score != null);
  const postedMax = assignment.points_possible ?? 0;
  const rubricMax = rubricPointsPossible ?? 0;
  let scoresDiffer = 0;
  for (const student of students.values()) {
    if (student.postedScore == null || student.rubricScore == null) continue;
    const gap =
      postedMax > 0 && rubricMax > 0
        ? Math.abs(student.postedScore / postedMax - student.rubricScore / rubricMax)
        : Math.abs(student.postedScore - student.rubricScore);
    if (gap > 0.01) scoresDiffer += 1;
  }

  const markerCounts = new Map<number, number>();
  for (const student of students.values()) {
    const markerId = student.assessorId ?? student.graderId;
    if (markerId == null || student.marks.length === 0) continue;
    markerCounts.set(markerId, (markerCounts.get(markerId) ?? 0) + 1);
  }

  const catalogCriteria = criteriaFromRubric(criteria);
  const catalogById = new Map(catalogCriteria.map((item) => [item.id, item]));

  const criterionSummaries: RubricCriterionSummary[] = criteria.map((criterion) => {
    const id = String(criterion.id ?? '');
    const catalogCriterion = catalogById.get(id);
    const ratingLabels = new Map<string, string>();
    for (const rating of criterion.ratings ?? []) {
      if (rating.id == null) continue;
      ratingLabels.set(String(rating.id), stripHtml(rating.description || `${rating.points ?? ''} pts`));
    }
    const ratingCounts = new Map<string, number>();
    const ratingCountsByKey: Record<string, number> = {};
    const pointValues: number[] = [];
    const comments: RubricComment[] = [];
    let commentCount = 0;

    for (const student of students.values()) {
      const mark = student.marks.find((item) => item.criterionId === id);
      if (!mark) continue;
      if (mark.points != null) pointValues.push(mark.points);
      const label = (mark.ratingId && ratingLabels.get(mark.ratingId)) || (mark.points != null ? `${mark.points} pts` : '');
      if (label) ratingCounts.set(label, (ratingCounts.get(label) ?? 0) + 1);
      if (catalogCriterion) {
        const key = assignRating(catalogCriterion, mark);
        if (key) ratingCountsByKey[key] = (ratingCountsByKey[key] ?? 0) + 1;
      }
      const text = stripHtml(mark.comments);
      if (!text) continue;
      commentCount += 1;
      if (comments.length >= CRITERION_COMMENT_LIMIT) continue;
      const markerId = student.assessorId ?? student.graderId;
      const marker = markerId != null ? staff.get(markerId) : undefined;
      comments.push({
        studentName: student.name,
        text,
        markerName: marker?.name ?? 'Staff',
      });
    }

    const ratings: { label: string; count: number }[] = [];
    for (const rating of criterion.ratings ?? []) {
      if (rating.id == null) continue;
      const label =
        ratingLabels.get(String(rating.id)) ??
        stripHtml(rating.description || `${rating.points ?? ''} pts`);
      ratings.push({ label, count: ratingCounts.get(label) ?? 0 });
    }
    for (const [label, count] of ratingCounts) {
      if (!ratings.some((item) => item.label === label)) ratings.push({ label, count });
    }

    const totalRatingCount = Object.values(ratingCountsByKey).reduce((sum, count) => sum + count, 0);

    return {
      id,
      description: stripHtml(criterion.description || 'Criterion'),
      pointsPossible: criterion.points ?? 0,
      ignoreForScoring: criterion.ignore_for_scoring === true,
      averagePoints: average(pointValues),
      gradedCount: pointValues.length,
      ratings,
      ratingCountsByKey,
      totalRatingCount,
      comments,
      commentCount,
    };
  });

  const overall: RubricComment[] = [];
  let overallCount = 0;
  for (const student of students.values()) {
    for (const comment of student.staffComments) {
      overallCount += 1;
      if (overall.length >= COMMENT_LIMIT) continue;
      const marker = staff.get(comment.authorId);
      overall.push({
        studentName: student.name,
        text: comment.text,
        markerName: marker?.name ?? comment.authorName,
      });
    }
  }

  return {
    assignmentId: assignment.id,
    assignmentName: assignment.name ?? 'Assignment',
    hasRubric: true,
    source,
    pointsPossible: assignment.points_possible ?? null,
    rubricPointsPossible,
    postedAverage: average(posted),
    postedCount: posted.length,
    rubricAverage: average(rubricTotals),
    rubricCount: rubricTotals.length,
    scoresDiffer,
    criteria: criterionSummaries,
    markers: [...markerCounts.entries()]
      .map(([id, count]) => {
        const person = staff.get(id);
        return { name: person?.name ?? 'Staff', role: person?.role ?? 'Staff', count };
      })
      .sort((a, b) => b.count - a.count),
    comments: overall,
    commentCount: overallCount,
  };
}
