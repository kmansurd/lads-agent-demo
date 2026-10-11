import { CanvasApiError, fetchAllPages, mapPool } from './client';
import type { CourseContentRow } from './courseContentCatalog';
import { courseHasViewStatistics } from './coursePermissions';
import { applyParticipationViewsForDateRange } from './engagementPeriodParticipationViews';
import { findContentRowForUrl } from './contentUrlMatch';
import { toIsoDateUtc } from './courseTimeline';

const STUDENT_CAP = 200;
const PAGE_VIEW_CONCURRENCY = 10;

type CoursePageView = {
  url?: string;
  created_at?: string;
  interacted_at?: string;
};

function canvasRangeParams(start: Date, end: Date): Record<string, string> {
  const startDay = new Date(start);
  startDay.setHours(0, 0, 0, 0);
  const endDay = new Date(end);
  endDay.setHours(23, 59, 59, 999);
  return {
    start_time: startDay.toISOString(),
    end_time: endDay.toISOString(),
  };
}

function viewTimestamp(view: CoursePageView): string | null {
  return view.created_at ?? view.interacted_at ?? null;
}

function viewInRange(
  view: CoursePageView,
  start: Date,
  end: Date,
): boolean {
  const ts = viewTimestamp(view);
  if (!ts) return true;
  const day = ts.slice(0, 10);
  return day >= toIsoDateUtc(start) && day <= toIsoDateUtc(end);
}

async function loadStudentIds(courseId: string): Promise<number[]> {
  const ids = new Set<number>();
  const enrollments = await fetchAllPages<{ user_id?: number }>(
    `/courses/${courseId}/enrollments`,
    { 'type[]': 'StudentEnrollment', 'state[]': ['active', 'invited', 'completed'] },
  ).catch(() => []);
  for (const e of enrollments) {
    if (e.user_id != null) ids.add(Number(e.user_id));
  }
  return [...ids];
}

async function fetchUserPageViewsInCourse(
  courseId: string,
  userId: number,
  start: Date,
  end: Date,
): Promise<CoursePageView[]> {
  const params = canvasRangeParams(start, end);
  try {
    const all = await fetchAllPages<CoursePageView>(`/users/${userId}/page_views`, params);
    const needle = `/courses/${courseId}`;
    return all.filter((v) => v.url?.includes(needle));
  } catch (err) {
    if (err instanceof CanvasApiError && (err.status === 403 || err.status === 404)) {
      return [];
    }
    throw err;
  }
}

export type PageViewPeriodSource = 'page_view_logs' | 'analytics_participations';

export type PageViewPeriodResult = {
  available: boolean;
  studentsScanned: number;
  viewsMatched: number;
  source: PageViewPeriodSource;
  viewStatisticsPermission: boolean;
};

/**
 * Count page views per catalog row using dated course (or user) page view history.
 */
export async function applyPageViewsForDateRange(
  courseId: string,
  content: CourseContentRow[],
  start: Date,
  end: Date,
): Promise<PageViewPeriodResult> {
  const viewStatisticsPermission = await courseHasViewStatistics(courseId);

  if (!viewStatisticsPermission) {
    const fallback = await applyParticipationViewsForDateRange(
      courseId,
      content,
      start,
      end,
    );
    return {
      available: fallback.viewsMatched > 0,
      studentsScanned: fallback.studentsScanned,
      viewsMatched: fallback.viewsMatched,
      source: 'analytics_participations',
      viewStatisticsPermission: false,
    };
  }

  for (const row of content) {
    row.pageViews = 0;
  }

  const studentIds = await loadStudentIds(courseId);
  if (studentIds.length === 0) {
    return {
      available: false,
      studentsScanned: 0,
      viewsMatched: 0,
      source: 'page_view_logs',
      viewStatisticsPermission: true,
    };
  }

  const capped =
    studentIds.length > STUDENT_CAP ? studentIds.slice(0, STUDENT_CAP) : studentIds;

  const viewCounts = new Map<string, number>();
  const viewStudents = new Map<string, Set<number>>();
  let anyRows = false;
  let viewsMatched = 0;

  await mapPool(capped, PAGE_VIEW_CONCURRENCY, async (userId) => {
    let views: CoursePageView[] = [];
    try {
      views = await fetchUserPageViewsInCourse(courseId, userId, start, end);
    } catch {
      return;
    }
    if (views.length > 0) anyRows = true;

    for (const view of views) {
      if (!view.url || !viewInRange(view, start, end)) continue;
      const row = findContentRowForUrl(content, view.url, courseId);
      if (!row) continue;
      viewsMatched += 1;
      viewCounts.set(row.id, (viewCounts.get(row.id) ?? 0) + 1);
      let set = viewStudents.get(row.id);
      if (!set) {
        set = new Set();
        viewStudents.set(row.id, set);
      }
      set.add(userId);
    }
  });

  if (!anyRows || viewsMatched === 0) {
    const fallback = await applyParticipationViewsForDateRange(
      courseId,
      content,
      start,
      end,
    );
    return {
      available: fallback.viewsMatched > 0,
      studentsScanned: fallback.studentsScanned,
      viewsMatched: fallback.viewsMatched,
      source: 'analytics_participations',
      viewStatisticsPermission: true,
    };
  }

  for (const row of content) {
    const count = viewCounts.get(row.id);
    row.pageViews = count ?? 0;
    const viewers = viewStudents.get(row.id);
    if (viewers && viewers.size > 0) {
      row.students = viewers.size;
    }
  }

  return {
    available: true,
    studentsScanned: capped.length,
    viewsMatched,
    source: 'page_view_logs',
    viewStatisticsPermission: true,
  };
}
