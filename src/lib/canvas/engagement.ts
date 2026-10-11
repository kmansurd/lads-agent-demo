import { canvasRequest } from './client';
import { listCourseContentCatalog, type CourseContentRow } from './courseContentCatalog';
import {
  aggregateDailyToWeekly,
  filterDailyToWindow,
  type DailyActivityPoint,
} from './engagementChart';
import { applyAssignmentMetricsForDateRange } from './engagementPeriodMetrics';
import { applyPageViewsForDateRange } from './engagementPeriodPageViews';
import {
  formatRangeLabel,
  resolveEngagementRange,
  type EngagementRangeMeta,
} from './engagementRange';
import { semesterDataCutoff } from './semesterWindow';

export type EngagementChart = {
  labels: string[];
  pageViews: number[];
  participations: number[];
  note: string;
};

export type CourseEngagementPayload = {
  chart: EngagementChart;
  content: CourseContentRow[];
  dailyActivity: DailyActivityPoint[];
  range: EngagementRangeMeta;
  dataSources: string[];
};

export type GetCourseEngagementOptions = {
  start?: string | null;
  end?: string | null;
  contentOnly?: boolean;
};

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

export function parseCourseAnalyticsActivity(raw: unknown): DailyActivityPoint[] {
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
      .filter((x): x is DailyActivityPoint => x != null);
  }

  if (typeof raw === 'object') {
    const obj = raw as Record<string, unknown>;
    const byDate = new Map<string, DailyActivityPoint>();

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
        if (typeof row === 'object' && row !== null) {
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
    }

    return Array.from(byDate.values()).sort((a, b) => a.date.localeCompare(b.date));
  }

  return [];
}

export async function getCourseEngagement(
  courseId: string,
  options: GetCourseEngagementOptions = {},
): Promise<CourseEngagementPayload> {
  const dataSources = [
    'GET /courses/:id/analytics/activity',
    'GET /users/:user_id/page_views or analytics/users/:id/activity participations (table date range)',
    'GET /courses/:id/assignments/:id/submissions (submissions in range)',
    'GET /courses/:id/assignments, /pages, /files, /quizzes, /discussion_topics, /modules',
  ];

  const { semester, range, meta } = resolveEngagementRange(options.start, options.end);
  const dataThrough = semesterDataCutoff(semester);

  let dailyActivity: DailyActivityPoint[] = [];
  let chartNote =
    'Course-wide page views and participations from Canvas Analytics (`/analytics/activity`).';

  if (!options.contentOnly) {
    try {
      const activityRaw = await canvasRequest<unknown>(
        `/courses/${courseId}/analytics/activity`,
      );
      dailyActivity = filterDailyToWindow(
        parseCourseAnalyticsActivity(activityRaw),
        semester.start,
        dataThrough,
      );
    } catch {
      chartNote =
        'Canvas Analytics activity is unavailable (Analytics may be disabled or this token lacks access).';
    }
  }

  const dailyInRange = filterDailyToWindow(dailyActivity, range.start, range.end);
  const weekly = aggregateDailyToWeekly(dailyInRange, range.start, range.end);

  const rangeLabel = `${formatRangeLabel(meta.selectedStart)} – ${formatRangeLabel(meta.selectedEnd)}`;
  let contentNote =
    'Table page views use dated page-view logs when Statistics permission is enabled; otherwise Canvas Analytics participation URLs in the selected range. Assignments also show submissions with `submitted_at` in range.';

  let content: CourseContentRow[] = [];
  try {
    content = await listCourseContentCatalog(courseId);
    const pageViews = await applyPageViewsForDateRange(
      courseId,
      content,
      range.start,
      range.end,
    );
    await applyAssignmentMetricsForDateRange(courseId, content, range.start, range.end);

    if (pageViews.source === 'analytics_participations') {
      contentNote +=
        ' Page views are inferred from analytics participation events (assignments/LTI activity)—not full Access Report view counts. Pages and files may stay at 0 without Statistics - view permission.';
    } else if (!pageViews.available && pageViews.viewsMatched === 0) {
      contentNote +=
        ' No page-view rows returned for this range (roster empty or no matching URLs).';
    }

    if (!pageViews.viewStatisticsPermission) {
      contentNote +=
        ' Enable Statistics - view on your Canvas role (or use a token with that permission) for Access Report–style per-item view counts.';
    }

    if (pageViews.studentsScanned >= 200) {
      contentNote += ` Metrics sampled from the first ${pageViews.studentsScanned} students.`;
    }
  } catch {
    contentNote = 'Course content metrics could not be fully loaded for this range.';
  }

  return {
    chart: {
      labels: weekly.labels,
      pageViews: weekly.pageViews,
      participations: weekly.participations,
      note: `${chartNote} Showing ${rangeLabel}. ${semester.sourceNote} ${contentNote}`,
    },
    content,
    dailyActivity: options.contentOnly ? [] : dailyActivity,
    range: meta,
    dataSources,
  };
}
