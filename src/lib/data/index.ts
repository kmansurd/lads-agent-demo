/**
 * src/lib/data/index.ts
 *
 * Single entry-point for analytics data.
 * Chooses between the live Canvas source and the static mock depending on
 * environment variables — components and route handlers never import directly
 * from canvas.ts or mock.ts.
 */

import { getMockCourseAnalytics } from '@/lib/data/mock';
import type { CourseAnalytics } from '@/types/analytics';

/** @deprecated Prefer `/api/courses/[courseId]/*` tab routes; kept for legacy `/api/analytics`. */
export async function getCourseAnalytics(): Promise<CourseAnalytics> {
  return getMockCourseAnalytics();
}
