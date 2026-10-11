import { fetchAllPages } from './client';
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
  pagesViewed: number;
  participations: number;
  missingWorkPct: number | null;
  missingWorkLabel: string;
};

export async function getCourseStudents(courseId: string): Promise<StudentRow[]> {
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
      pagesViewed: summary?.page_views ?? 0,
      participations: summary?.participations ?? 0,
      missingWorkPct: missingWork.missingWorkPct,
      missingWorkLabel: missingWork.label,
    });
  }

  rows.sort((a, b) => a.name.localeCompare(b.name));
  return rows;
}
