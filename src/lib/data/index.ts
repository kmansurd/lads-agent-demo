/**
 * src/lib/data/index.ts
 *
 * Single entry-point for analytics data.
 * Chooses between the live Canvas source and the static mock depending on
 * environment variables — components and route handlers never import directly
 * from canvas.ts or mock.ts.
 */

import { getDataSource, isCanvasConfigured } from '@/lib/config';
import { getMockCourseAnalytics } from '@/lib/data/mock';
import { getCanvasCourseAnalytics } from '@/lib/data/canvas';
import type { CourseAnalytics } from '@/types/analytics';

export async function getCourseAnalytics(): Promise<CourseAnalytics> {
  if (getDataSource() === 'canvas' && isCanvasConfigured()) {
    return getCanvasCourseAnalytics();
  }
  return getMockCourseAnalytics();
}
