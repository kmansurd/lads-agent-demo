import { fetchAllPages } from './client';
import { resolveEngagementRange, type EngagementRangeMeta } from './engagementRange';
import { STUDENT_ACTIVITY_CAP, rollupStudentActivityInRange } from './studentActivityRollup';
import { missingWorkFromSummary } from './studentTardiness';

type StudentSummary = {
  id: number;
  page_views?: number;
  participations?: number;
  tardiness_breakdown?: {
    on_time?: number;
    late?: number;
    missing?: number;
    total?: number;
  };
};

type CanvasUser = {
  id: number;
  name?: string;
  sortable_name?: string;
};

type CanvasEnrollment = {
  user_id: number;
  last_activity_at?: string | null;
  grades?: {
    current_score?: number | null;
    final_score?: number | null;
  };
};

export type StudentRow = {
  id: number;
  name: string;
  grade: number | null;
  lastActivity: string;
  /** Hourly analytics page views in the selected range (UBC method). Null if not scanned. */
  pagesViewedInRange: number | null;
  /** Course-lifetime page views from analytics/student_summaries. */
  pagesViewedCourse: number;
  /** Participation events in the selected range, excluding GraphQL noise. */
  participationsInRange: number | null;
  /** Days in range with at least one hourly page view. Null if not scanned. */
  activeDays: number | null;
  /** Page views divided by days in the selected range. */
  avgDailyViews: number | null;
  /** Days in range with no hourly page views. */
  quietDays: number | null;
  /** Longest run of days in range with no hourly page views. */
  longestQuietDays: number | null;
  /** Active days as a percent of days in the selected range. */
  engagementRate: number | null;
  /** Weekly page-view totals aligned to the selected range. Null if not scanned. */
  weeklyViews: number[] | null;
  /** Course-lifetime participations from analytics/student_summaries. */
  participations: number;
  missingWorkPct: number | null;
  missingWorkLabel: string;
};

export type CourseStudentsPayload = {
  students: StudentRow[];
  range: EngagementRangeMeta;
  studentsScanned: number;
  activityNote: string;
};

export async function getCourseStudents(
  courseId: string,
  options: { start?: string | null; end?: string | null; includeActivity?: boolean } = {},
): Promise<CourseStudentsPayload> {
  const { range, meta } = resolveEngagementRange(options.start, options.end);
  const [summaries, users, enrollments] = await Promise.all([
    fetchAllPages<StudentSummary>(`/courses/${courseId}/analytics/student_summaries`).catch(
      () => [] as StudentSummary[],
    ),
    fetchAllPages<CanvasUser>(`/courses/${courseId}/users`, {
      'enrollment_type[]': 'student',
    }),
    fetchAllPages<CanvasEnrollment>(`/courses/${courseId}/enrollments`, {
      'type[]': 'StudentEnrollment',
      'state[]': ['active', 'invited', 'completed'],
    }),
  ]);

  const userById = new Map(users.map((u) => [u.id, u]));
  const enrollmentByUser = new Map(enrollments.map((e) => [e.user_id, e]));

  const summaryById = new Map(summaries.map((s) => [s.id, s]));

  const ids = new Set<number>([
    ...users.map((u) => u.id),
    ...summaries.map((s) => s.id),
  ]);

  const rows: StudentRow[] = [];

  for (const id of ids) {
    const user = userById.get(id);
    const summary = summaryById.get(id);
    const enrollment = enrollmentByUser.get(id);

    const name = user?.sortable_name || user?.name || `Student ${id}`;
    const grade =
      enrollment?.grades?.current_score ?? enrollment?.grades?.final_score ?? null;
    const lastActivity = enrollment?.last_activity_at
      ? enrollment.last_activity_at.slice(0, 10)
      : '—';

    const missingWork = missingWorkFromSummary(summary?.tardiness_breakdown);

    rows.push({
      id,
      name,
      grade: grade != null ? Math.round(grade) : null,
      lastActivity,
      pagesViewedInRange: null,
      pagesViewedCourse: summary?.page_views ?? 0,
      participationsInRange: null,
      activeDays: null,
      avgDailyViews: null,
      quietDays: null,
      longestQuietDays: null,
      engagementRate: null,
      weeklyViews: null,
      participations: summary?.participations ?? 0,
      missingWorkPct: missingWork.missingWorkPct,
      missingWorkLabel: missingWork.label,
    });
  }

  const includeActivity = options.includeActivity !== false;
  const scanOrder = [...rows].sort(
    (a, b) => b.pagesViewedCourse - a.pagesViewedCourse || a.name.localeCompare(b.name),
  );
  const scanIds = includeActivity
    ? scanOrder.slice(0, STUDENT_ACTIVITY_CAP).map((row) => row.id)
    : [];
  const rollup = includeActivity
    ? await rollupStudentActivityInRange(courseId, scanIds, range.start, range.end)
    : new Map();

  for (const row of rows) {
    const activity = rollup.get(row.id);
    if (!activity) continue;
    row.pagesViewedInRange = activity.pageViewsInRange;
    row.participationsInRange = activity.participationsInRange;
    row.activeDays = activity.activeDays;
    row.avgDailyViews = activity.avgDailyViews;
    row.quietDays = activity.quietDays;
    row.longestQuietDays = activity.longestQuietDays;
    row.engagementRate = activity.engagementRate;
    row.weeklyViews = activity.weeklyViews;
  }

  rows.sort((a, b) => a.name.localeCompare(b.name));

  const scanned = rollup.size;
  const activityNote = !includeActivity
    ? 'Course totals only.'
    : scanned < rows.length
      ? `Page views, active days, and quiet stretches use hourly Canvas Analytics for the ${scanned} students with the most course page views. Other rows show course totals only. Check students in the table to compare their weeks.`
      : 'Page views, active days, and quiet stretches use hourly Canvas Analytics for every student. Check students in the table to compare their weeks.';

  return {
    students: rows,
    range: meta,
    studentsScanned: scanned,
    activityNote,
  };
}
