import { addHourlyPageViews, timeOfDayFromHistogram, type TimeOfDayPattern } from './activityPatterns';
import { canvasRequest, fetchAllPages, mapPool } from './client';
import type { CourseContentRow } from './courseContentCatalog';
import { findContentRowForUrl, normalizeActivityUrl } from './contentUrlMatch';
import {
  getCachedStudentAnalyticsActivity,
  isNoiseParticipationUrl,
} from './studentAnalyticsActivity';
import { toIsoDateUtc } from './courseTimeline';

const STUDENT_CAP = 200;
const CONCURRENCY = 10;

function participationInRange(
  createdAt: string | undefined,
  start: Date,
  end: Date,
): boolean {
  if (!createdAt) return false;
  const day = createdAt.slice(0, 10);
  return day >= toIsoDateUtc(start) && day <= toIsoDateUtc(end);
}

async function buildLineItemToAssignmentMap(courseId: string): Promise<Map<number, number>> {
  const assignments = await fetchAllPages<{ id: number }>(`/courses/${courseId}/assignments`).catch(
    () => [],
  );
  const map = new Map<number, number>();

  await mapPool(assignments, 5, async (assignment) => {
    try {
      const items = await canvasRequest<Array<{ id: number }>>(
        `/courses/${courseId}/assignments/${assignment.id}/line_items`,
      );
      for (const item of items) {
        map.set(item.id, assignment.id);
      }
    } catch {
      /* assignment may have no LTI line item */
    }
  });

  return map;
}

function findRowForActivityEvent(
  content: CourseContentRow[],
  rawUrl: string,
  courseId: string,
  lineItemToAssignment: Map<number, number>,
): CourseContentRow | undefined {
  const normalized = normalizeActivityUrl(rawUrl, courseId);
  const lineMatch = normalized.match(/\/line_items\/(\d+)/i);
  if (lineMatch) {
    const assignmentId = lineItemToAssignment.get(Number(lineMatch[1]));
    if (assignmentId != null) {
      return (
        content.find((r) => r.type === 'assignment' && r.canvasId === assignmentId) ??
        content.find((r) => r.type === 'quiz' && r.canvasId === assignmentId)
      );
    }
  }
  return findContentRowForUrl(content, normalized, courseId);
}

async function loadStudentIds(courseId: string): Promise<number[]> {
  const users = await fetchAllPages<{ id: number }>(`/courses/${courseId}/users`, {
    'enrollment_type[]': 'student',
    'enrollment_state[]': ['active', 'invited', 'completed'],
  }).catch(() => []);
  return users.map((u) => u.id);
}

/**
 * Per-item view proxy: count Canvas Analytics participation URLs in the date range.
 * Used when page-view logs are unavailable (e.g. view_statistics permission).
 */
export type ParticipationViewsResult = {
  studentsScanned: number;
  viewsMatched: number;
  /** Course-wide student page views in range (hourly analytics buckets, UBC-style). */
  totalHourlyPageViewsInRange: number;
  timeOfDay: TimeOfDayPattern;
};

export async function applyParticipationViewsForDateRange(
  courseId: string,
  content: CourseContentRow[],
  start: Date,
  end: Date,
): Promise<ParticipationViewsResult> {
  for (const row of content) {
    row.pageViews = 0;
  }

  const studentIds = await loadStudentIds(courseId);
  if (studentIds.length === 0) {
    return {
      studentsScanned: 0,
      viewsMatched: 0,
      totalHourlyPageViewsInRange: 0,
      timeOfDay: timeOfDayFromHistogram(new Array(24).fill(0), 0),
    };
  }

  const capped =
    studentIds.length > STUDENT_CAP ? studentIds.slice(0, STUDENT_CAP) : studentIds;

  const lineItemToAssignment = await buildLineItemToAssignmentMap(courseId);

  const viewCounts = new Map<string, number>();
  const viewStudents = new Map<string, Set<number>>();
  let viewsMatched = 0;
  let totalHourlyPageViewsInRange = 0;
  const hours = new Array<number>(24).fill(0);

  await mapPool(capped, CONCURRENCY, async (userId) => {
    let activity;
    try {
      activity = await getCachedStudentAnalyticsActivity(courseId, userId);
    } catch {
      return;
    }

    totalHourlyPageViewsInRange += addHourlyPageViews(hours, activity.page_views, start, end);

    for (const event of activity.participations ?? []) {
      if (!event.url || isNoiseParticipationUrl(event.url)) continue;
      if (!participationInRange(event.created_at, start, end)) continue;
      const row = findRowForActivityEvent(
        content,
        event.url,
        courseId,
        lineItemToAssignment,
      );
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

  for (const row of content) {
    row.pageViews = viewCounts.get(row.id) ?? 0;
    const viewers = viewStudents.get(row.id);
    if (viewers && viewers.size > 0) {
      row.students = viewers.size;
    }
  }

  return {
    studentsScanned: capped.length,
    viewsMatched,
    totalHourlyPageViewsInRange,
    timeOfDay: timeOfDayFromHistogram(hours, capped.length),
  };
}
