import {
  addHourlyPageViews,
  studentRhythmFromHourly,
  timeOfDayFromHistogram,
  type StudentRangeRhythm,
  type TimeOfDayPattern,
} from './activityPatterns';
import { mapPool } from './client';
import {
  countParticipationsInRange,
  getCachedStudentAnalyticsActivity,
  sumHourlyPageViewsInRange,
} from './studentAnalyticsActivity';

/** Matches UBC canvas-course-page-view-count: one analytics activity call per student. */
export const STUDENT_ACTIVITY_CAP = 200;
const CONCURRENCY = 8;

export type StudentActivityRollup = StudentRangeRhythm & {
  pageViewsInRange: number;
  participationsInRange: number;
};

export async function rollupStudentActivityInRange(
  courseId: string,
  studentIds: number[],
  start: Date,
  end: Date,
): Promise<Map<number, StudentActivityRollup>> {
  const capped = studentIds.slice(0, STUDENT_ACTIVITY_CAP);
  const rows = await mapPool(capped, CONCURRENCY, async (studentId) => {
    try {
      const activity = await getCachedStudentAnalyticsActivity(courseId, studentId);
      const rhythm = studentRhythmFromHourly(activity.page_views, start, end);
      return {
        studentId,
        pageViewsInRange: sumHourlyPageViewsInRange(activity.page_views, start, end),
        participationsInRange: countParticipationsInRange(
          activity.participations,
          start,
          end,
          { excludeNoise: true },
        ),
        ...rhythm,
      };
    } catch {
      return {
        studentId,
        pageViewsInRange: 0,
        participationsInRange: 0,
        ...studentRhythmFromHourly(undefined, start, end),
      };
    }
  });

  return new Map(
    rows.map((row) => [
      row.studentId,
      {
        pageViewsInRange: row.pageViewsInRange,
        participationsInRange: row.participationsInRange,
        activeDays: row.activeDays,
        avgDailyViews: row.avgDailyViews,
        quietDays: row.quietDays,
        longestQuietDays: row.longestQuietDays,
        engagementRate: row.engagementRate,
        weeklyViews: row.weeklyViews,
      },
    ]),
  );
}

/** Hour-of-day totals for a student sample. Uses the shared activity cache. */
export async function collectTimeOfDayForStudents(
  courseId: string,
  studentIds: number[],
  start: Date,
  end: Date,
): Promise<TimeOfDayPattern> {
  const hours = new Array<number>(24).fill(0);
  await mapPool(studentIds, CONCURRENCY, async (studentId) => {
    try {
      const activity = await getCachedStudentAnalyticsActivity(courseId, studentId);
      addHourlyPageViews(hours, activity.page_views, start, end);
    } catch {
      /* skip students the activity endpoint rejects */
    }
  });
  return timeOfDayFromHistogram(hours, studentIds.length);
}
