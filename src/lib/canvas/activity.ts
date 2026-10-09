import { canvasRequest, fetchAllPages } from './client';
import { getCanvasConfig } from './config';
import { listCourseResources, type CourseResource } from './courseResources';
import {
  resolveCourseActivityWindow,
  startOfWeekMondayUtc,
  toIsoDateUtc,
  weekLabel,
  type CanvasCourseTimeline,
} from './courseTimeline';
import {
  aggregateResourceMetricsFromStudents,
  applyAssignmentAnalytics,
  loadStudentIdsForResourceMetrics,
} from './resourceMetrics';

export type WeeklyActivityChart = {
  labels: string[];
  pageViews: number[];
  participations: number[];
  note: string;
};

export type ResourceActivityRow = {
  id: number;
  resource: string;
  students: number;
  pageViews: number;
  participations: number;
  type: CourseResource['type'];
};

export type WeeklyActivityPayload = {
  chart: WeeklyActivityChart;
  resources: ResourceActivityRow[];
};

type DailyActivity = {
  date: string;
  views: number;
  participations: number;
};

type TardinessBreakdown = {
  on_time?: number;
  late?: number;
  missing?: number;
  total?: number;
};

type AnalyticsAssignmentRow = {
  assignment_id: number;
  title: string;
  tardiness_breakdown?: TardinessBreakdown;
  page_views?: number;
  views?: number;
  participations?: number;
  students?: number;
};

/** Sum all numeric values in a page-view category object for one day. */
function sumViewCategories(value: unknown): number {
  if (typeof value === 'number') return value;
  if (value && typeof value === 'object') {
    return Object.values(value as Record<string, unknown>).reduce<number>(
      (sum, v) => sum + (typeof v === 'number' ? v : 0),
      0,
    );
  }
  return 0;
}

/**
 * Canvas Analytics activity can be returned as a daily array or as
 * page_views (by date) + participations (by date). Both match Course Analytics.
 */
export function parseCourseAnalyticsActivity(raw: unknown): DailyActivity[] {
  if (!raw) return [];

  if (Array.isArray(raw)) {
    return raw
      .map((row) => {
        const r = row as Record<string, unknown>;
        const date = String(r.date ?? '');
        if (!date) return null;
        const views =
          typeof r.views === 'number'
            ? r.views
            : sumViewCategories(r.page_views) ||
              (typeof r.page_views === 'number' ? r.page_views : 0);
        const participations =
          typeof r.participations === 'number' ? r.participations : 0;
        return { date, views, participations };
      })
      .filter((x): x is DailyActivity => x != null);
  }

  if (typeof raw === 'object') {
    const obj = raw as Record<string, unknown>;
    const byDate = new Map<string, DailyActivity>();

    const pageViews = obj.page_views;
    if (pageViews && typeof pageViews === 'object') {
      for (const [date, value] of Object.entries(pageViews as Record<string, unknown>)) {
        byDate.set(date, {
          date,
          views: sumViewCategories(value),
          participations: 0,
        });
      }
    }

    const participations = obj.participations;
    if (Array.isArray(participations)) {
      for (const row of participations) {
        if (typeof row === 'string') {
          const existing = byDate.get(row) ?? { date: row, views: 0, participations: 0 };
          existing.participations += 1;
          byDate.set(row, existing);
          continue;
        }
        const r = row as Record<string, unknown>;
        const date = String(r.date ?? '');
        if (!date) continue;
        const existing = byDate.get(date) ?? { date, views: 0, participations: 0 };
        existing.participations =
          typeof r.participations === 'number' ? r.participations : existing.participations + 1;
        if (typeof r.views === 'number') existing.views = r.views;
        byDate.set(date, existing);
      }
    }

    return Array.from(byDate.values()).sort((a, b) => a.date.localeCompare(b.date));
  }

  return [];
}

function filterDailyToWindow(
  daily: DailyActivity[],
  windowStart: Date,
  windowEnd: Date,
): DailyActivity[] {
  const startKey = toIsoDateUtc(windowStart);
  const endKey = toIsoDateUtc(windowEnd);
  return daily.filter((d) => d.date >= startKey && d.date <= endKey);
}

/**
 * Aggregate daily Canvas Analytics activity into course weeks (Monday-based),
 * filling every week from the course/term window through the end date.
 */
export function aggregateDailyToWeekly(
  daily: DailyActivity[],
  windowStart: Date,
  windowEnd: Date,
): { labels: string[]; pageViews: number[]; participations: number[] } {
  const anchor = startOfWeekMondayUtc(windowStart);
  const endWeekIndex = Math.max(
    0,
    Math.floor((windowEnd.getTime() - anchor.getTime()) / (7 * 86400000)),
  );

  const weekMap = new Map<number, { views: number; participations: number }>();

  for (const entry of daily) {
    const day = new Date(`${entry.date}T12:00:00.000Z`);
    if (Number.isNaN(day.getTime())) continue;
    const weekIndex = Math.floor((day.getTime() - anchor.getTime()) / (7 * 86400000));
    if (weekIndex < 0 || weekIndex > endWeekIndex) continue;
    const cur = weekMap.get(weekIndex) ?? { views: 0, participations: 0 };
    weekMap.set(weekIndex, {
      views: cur.views + entry.views,
      participations: cur.participations + entry.participations,
    });
  }

  const labels: string[] = [];
  const pageViews: number[] = [];
  const participations: number[] = [];

  for (let i = 0; i <= endWeekIndex; i++) {
    labels.push(weekLabel(i, anchor));
    const bucket = weekMap.get(i) ?? { views: 0, participations: 0 };
    pageViews.push(bucket.views);
    participations.push(bucket.participations);
  }

  return { labels, pageViews, participations };
}

async function fetchAnalyticsAssignments(
  courseId: string,
): Promise<AnalyticsAssignmentRow[]> {
  const first = await canvasRequest<unknown>(`/courses/${courseId}/analytics/assignments`, {
    async: 'true',
  });

  if (Array.isArray(first)) return first as AnalyticsAssignmentRow[];

  if (first && typeof first === 'object') {
    const obj = first as Record<string, unknown>;
    if (Array.isArray(obj.assignments)) {
      return obj.assignments as AnalyticsAssignmentRow[];
    }
    const progressUrl = obj.progress_url as string | undefined;
    const config = getCanvasConfig();
    if (progressUrl && config?.token) {
      for (let i = 0; i < 15; i++) {
        await new Promise((r) => setTimeout(r, 2000));
        const poll = await fetch(progressUrl, {
          headers: {
            Accept: 'application/json',
            Authorization: `Bearer ${config.token}`,
          },
          cache: 'no-store',
        });
        if (!poll.ok) break;
        const body = (await poll.json()) as Record<string, unknown>;
        if (body.workflow_state === 'failed') break;
        if (body.workflow_state === 'completed' && Array.isArray(body.results)) {
          return body.results as AnalyticsAssignmentRow[];
        }
      }
    }
  }

  return [];
}

async function linkWikiPageIds(courseId: string, resources: CourseResource[]): Promise<void> {
  try {
    const pages = await fetchAllPages<{ url: string; page_id: number }>(
      `/courses/${courseId}/pages`,
    );
    const idBySlug = new Map(pages.map((p) => [p.url, p.page_id]));
    for (const resource of resources) {
      if (resource.type !== 'page') continue;
      const slugKey = resource.matchKeys.find((k) => k.includes('/pages/'));
      const slug = slugKey?.split('/pages/')[1];
      if (slug && idBySlug.has(slug)) {
        resource.contentId = idBySlug.get(slug);
      }
    }
  } catch {
    // optional
  }
}

async function linkQuizAssignments(
  courseId: string,
  resources: CourseResource[],
): Promise<void> {
  try {
    const quizzes = await fetchAllPages<{ id: number; assignment_id?: number }>(
      `/courses/${courseId}/quizzes`,
    );
    const byQuizId = new Map(quizzes.map((q) => [q.id, q.assignment_id]));
    for (const resource of resources) {
      if (resource.quizId && !resource.assignmentId) {
        const assignmentId = byQuizId.get(resource.quizId);
        if (assignmentId) resource.assignmentId = assignmentId;
      }
    }
  } catch {
    // quizzes optional
  }
}

export async function getWeeklyActivity(courseId: string): Promise<WeeklyActivityPayload> {
  const course = await canvasRequest<CanvasCourseTimeline>(`/courses/${courseId}`, {
    'include[]': 'term',
  });

  const window = resolveCourseActivityWindow(course);

  let daily: DailyActivity[] = [];
  let chartNote =
    'Weekly totals from Canvas Analytics (`GET /courses/…/analytics/activity`), bucketed by course/term week.';

  try {
    const activityRaw = await canvasRequest<unknown>(
      `/courses/${courseId}/analytics/activity`,
    );
    daily = filterDailyToWindow(
      parseCourseAnalyticsActivity(activityRaw),
      window.start,
      window.end,
    );
  } catch {
    chartNote =
      'Canvas Analytics activity is unavailable for this course (Analytics may be disabled or the token lacks permission).';
  }

  const weekly =
    daily.length > 0 || window.start <= window.end
      ? aggregateDailyToWeekly(daily, window.start, window.end)
      : { labels: [] as string[], pageViews: [] as number[], participations: [] as number[] };

  let rosterSize = 0;
  try {
    const enrollments = await fetchAllPages<{ user_id?: number }>(
      `/courses/${courseId}/enrollments`,
      { 'type[]': 'StudentEnrollment', 'state[]': 'active' },
    );
    rosterSize = enrollments.length;
  } catch {
    rosterSize = 0;
  }

  let resourcesCatalog: CourseResource[] = [];
  try {
    resourcesCatalog = await listCourseResources(courseId);
    await linkQuizAssignments(courseId, resourcesCatalog);
    await linkWikiPageIds(courseId, resourcesCatalog);
  } catch {
    resourcesCatalog = [];
  }

  const metricsById = new Map<number, { students: number; pageViews: number; participations: number }>();
  for (const r of resourcesCatalog) {
    metricsById.set(r.id, { students: 0, pageViews: 0, participations: 0 });
  }

  let assignmentRows: AnalyticsAssignmentRow[] = [];
  try {
    assignmentRows = await fetchAnalyticsAssignments(courseId);
    applyAssignmentAnalytics(resourcesCatalog, metricsById, assignmentRows, rosterSize);
  } catch {
    // optional
  }

  let resourceDetailNote =
    'Resource rows list published module items from Canvas (pages, assignments, quizzes, discussions, files, etc.).';
  let pageViewNote = '';

  try {
    const studentIds = await loadStudentIdsForResourceMetrics(courseId);
    if (studentIds.length > 0 && resourcesCatalog.length > 0) {
      const agg = await aggregateResourceMetricsFromStudents(
        courseId,
        resourcesCatalog,
        window,
        studentIds,
      );
      for (const resource of resourcesCatalog) {
        const fromStudents = agg.byResourceId.get(resource.id);
        if (!fromStudents) continue;
        const bucket = metricsById.get(resource.id)!;
        if (fromStudents.participations > 0) {
          bucket.participations = Math.max(bucket.participations, fromStudents.participations);
        }
        if (fromStudents.pageViews > 0) {
          bucket.pageViews = Math.max(bucket.pageViews, fromStudents.pageViews);
        }
        if (fromStudents.students > 0) {
          bucket.students = Math.max(bucket.students, fromStudents.students);
        }
      }
      if (agg.pageViewsSampled) {
        pageViewNote = ` Per-resource metrics use the first ${250} students in Canvas analytics summaries because the roster is large (${agg.studentsScanned} students).`;
      } else if (!agg.usageAvailable && agg.studentsScanned > 0) {
        pageViewNote =
          ' No student access-report rows were returned. Your role needs Canvas “View usage reports” (read_reports) for this course—not the account-only View Statistics permission used by /users/…/page_views.';
      } else if (agg.usageRowsFetched > 0 && agg.usageRowsMatched === 0) {
        pageViewNote =
          ' Access-report rows were returned but did not match published module resources (asset codes or titles).';
      }
      resourceDetailNote += ` Page views and participations by resource come from each student’s course access report (People → Access Report), same family of data as Canvas New Analytics.${pageViewNote}`;
    }
  } catch {
    resourceDetailNote +=
      ' Per-resource participations/page views could not be loaded from student analytics.';
  }

  const resources: ResourceActivityRow[] = resourcesCatalog.map((r) => {
    const m = metricsById.get(r.id) ?? { students: 0, pageViews: 0, participations: 0 };
    return {
      id: r.id,
      resource: r.title,
      students: m.students,
      pageViews: m.pageViews,
      participations: m.participations,
      type: r.type,
    };
  });

  return {
    chart: {
      labels: weekly.labels,
      pageViews: weekly.pageViews,
      participations: weekly.participations,
      note: `${chartNote} ${window.sourceNote} ${resourceDetailNote}`,
    },
    resources,
  };
}
