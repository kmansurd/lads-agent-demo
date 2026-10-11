import { sliceHourlyPageViews } from './activityPatterns';
import { canvasRequest } from './client';
import { toIsoDateUtc } from './courseTimeline';

export type ParticipationEvent = {
  created_at?: string;
  url?: string;
};

export type StudentAnalyticsActivity = {
  page_views?: Record<string, number>;
  participations?: ParticipationEvent[];
};

const ACTIVITY_CACHE_MS = 15 * 60 * 1000;

const activityCache = new Map<
  string,
  { expires: number; value: StudentAnalyticsActivity }
>();

/** Same endpoint as UBC canvas-course-page-view-count (analytics user activity). */
export async function fetchStudentAnalyticsActivity(
  courseId: string,
  studentId: number,
): Promise<StudentAnalyticsActivity> {
  return canvasRequest<StudentAnalyticsActivity>(
    `/courses/${courseId}/analytics/users/${studentId}/activity`,
  );
}

export async function getCachedStudentAnalyticsActivity(
  courseId: string,
  studentId: number,
): Promise<StudentAnalyticsActivity> {
  const key = `${courseId}:${studentId}`;
  const hit = activityCache.get(key);
  if (hit && hit.expires > Date.now()) return hit.value;

  const value = await fetchStudentAnalyticsActivity(courseId, studentId);
  activityCache.set(key, { expires: Date.now() + ACTIVITY_CACHE_MS, value });
  return value;
}

/**
 * Sum hourly page-view buckets from analytics activity for the selected calendar window.
 * @see https://github.com/ubc/canvas-course-page-view-count
 */
export function sumHourlyPageViewsInRange(
  pageViews: Record<string, number> | undefined,
  start: Date,
  end: Date,
): number {
  return sliceHourlyPageViews(pageViews, start, end).total;
}

export function countParticipationsInRange(
  events: ParticipationEvent[] | undefined,
  start: Date,
  end: Date,
  options?: { excludeNoise?: boolean },
): number {
  if (!events?.length) return 0;
  const startKey = toIsoDateUtc(start);
  const endKey = toIsoDateUtc(end);
  let count = 0;
  for (const event of events) {
    if (!event.created_at) continue;
    if (options?.excludeNoise && event.url && isNoiseParticipationUrl(event.url)) continue;
    const day = event.created_at.slice(0, 10);
    if (day >= startKey && day <= endKey) count += 1;
  }
  return count;
}

/** URLs that appear in participations but do not map to course content rows. */
export function isNoiseParticipationUrl(url: string): boolean {
  try {
    const u = new URL(url);
    const path = u.pathname.toLowerCase();
    if (path.includes('/api/graphql')) return true;
    if (path.endsWith('/api/graphql')) return true;
  } catch {
    return false;
  }
  return false;
}
