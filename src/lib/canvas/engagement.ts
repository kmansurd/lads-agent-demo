import { canvasRequest } from './client';
import type { CanvasCourseTimeline } from './courseTimeline';
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
import { analyzeDailyAccess, type DailyAccessPattern, type TimeOfDayPattern } from './activityPatterns';
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
  /** Course-wide day patterns from analytics/activity. */
  dailyPattern: DailyAccessPattern;
  /** Hour-of-day split from scanned students' hourly analytics buckets. */
  timeOfDay: TimeOfDayPattern;
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
    'GET /courses/:id?include[]=term (engagement date window)',
    'GET /courses/:id/analytics/activity',
    'GET /courses/:id/analytics/users/:id/activity (hourly page views + participation URLs; UBC-style)',
    'GET /users/:user_id/page_views (when Statistics permission enabled)',
    'GET /courses/:id/assignments/:id/submissions (submissions in range)',
    'GET /courses/:id/assignments, /pages, /files, /quizzes, /discussion_topics, /modules',
  ];

  const courseDetail = await canvasRequest<CanvasCourseTimeline>(`/courses/${courseId}`, {
    'include[]': ['term'],
  });

  const { semester, range, meta } = resolveEngagementRange(options.start, options.end, {
    course: courseDetail,
    termLabel: courseDetail.term?.name,
  });
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
  const dailyPattern = analyzeDailyAccess(
    dailyInRange.map((row) => ({ date: row.date, views: row.views })),
    range.start,
    range.end,
  );

  const rangeLabel = `${formatRangeLabel(meta.selectedStart)} – ${formatRangeLabel(meta.selectedEnd)}`;
  let contentNote =
    'Table page views use dated page-view logs when Statistics permission is enabled; otherwise Canvas Analytics participation URLs in the selected range. Assignments also show submissions with `submitted_at` in range.';

  let content: CourseContentRow[] = [];
  let timeOfDay: TimeOfDayPattern = {
    periods: [],
    peakHours: [],
    totalViews: 0,
    studentsScanned: 0,
    narrative: 'Hourly page views were not loaded for this range.',
  };
  try {
    content = await listCourseContentCatalog(courseId);
    const pageViews = await applyPageViewsForDateRange(
      courseId,
      content,
      range.start,
      range.end,
    );
    timeOfDay = pageViews.timeOfDay;
    await applyAssignmentMetricsForDateRange(courseId, content, range.start, range.end);

    if (pageViews.source === 'analytics_participations') {
      contentNote +=
        ' Per-row page views use participation URLs in range (assignments/LTI); course-wide student page views in range (hourly analytics, same approach as UBC canvas-course-page-view-count)';
      if (pageViews.totalHourlyPageViewsInRange > 0) {
        contentNote += `: ${pageViews.totalHourlyPageViewsInRange.toLocaleString()} total across scanned students.`;
      }
      contentNote +=
        ' Pages and files may stay at 0 without Statistics - view permission.';
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
    dailyPattern,
    timeOfDay,
    dataSources,
  };
}
