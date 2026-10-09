import { canvasRequest, fetchAllPages, mapPool } from './client';
import type { CourseResource } from './courseResources';
import { findResourceForUrl } from './courseResources';
import {
  fetchCourseUserUsage,
  findResourceForUsageRow,
  usageParticipationCount,
  usageViewCount,
} from './courseUserUsage';
import type { CourseActivityWindow } from './courseTimeline';

/** Canvas does not expose a course-level per-resource page-view API; cap full rollups for large rosters. */
const PAGE_VIEW_ROSTER_CAP = 250;
const STUDENT_ACTIVITY_CONCURRENCY = 12;
const USAGE_FETCH_CONCURRENCY = 10;

type StudentSummary = { id: number };

type ParticipationEvent = { url?: string };

type UserActivity = {
  participations?: ParticipationEvent[];
};

type TardinessBreakdown = {
  on_time?: number;
  late?: number;
  missing?: number;
  total?: number;
};

export type ResourceMetrics = {
  students: number;
  pageViews: number;
  participations: number;
};

export type ResourceMetricsResult = {
  byResourceId: Map<number, ResourceMetrics>;
  pageViewsSampled: boolean;
  studentsScanned: number;
  usageRowsFetched: number;
  usageRowsMatched: number;
  usageAvailable: boolean;
};

function breakdownToCounts(
  breakdown: TardinessBreakdown | undefined,
  rosterSize: number,
): { students: number; participations: number } {
  if (!breakdown) {
    return { students: 0, participations: 0 };
  }

  const total = breakdown.total ?? rosterSize;
  const onTime = breakdown.on_time ?? 0;
  const late = breakdown.late ?? 0;
  const missing = breakdown.missing ?? 0;

  const looksLikeFraction =
    onTime <= 1 && late <= 1 && missing <= 1 && onTime + late + missing <= 1.05;

  if (looksLikeFraction) {
    const submitted = Math.round((onTime + late) * total);
    const engaged = Math.round((1 - missing) * total);
    return { students: engaged, participations: submitted };
  }

  return {
    students: Math.max(0, total - Math.round(missing)),
    participations: Math.round(onTime + late),
  };
}

function emptyMetrics(): ResourceMetrics {
  return { students: 0, pageViews: 0, participations: 0 };
}

function ensureBucket(map: Map<number, ResourceMetrics>, resourceId: number): ResourceMetrics {
  let m = map.get(resourceId);
  if (!m) {
    m = emptyMetrics();
    map.set(resourceId, m);
  }
  return m;
}

export function applyAssignmentAnalytics(
  resources: CourseResource[],
  map: Map<number, ResourceMetrics>,
  assignmentRows: {
    assignment_id: number;
    tardiness_breakdown?: TardinessBreakdown;
    page_views?: number;
    views?: number;
    participations?: number;
    students?: number;
  }[],
  rosterSize: number,
): void {
  const byAssignmentId = new Map<number, CourseResource>();
  for (const r of resources) {
    if (r.assignmentId) byAssignmentId.set(r.assignmentId, r);
  }

  for (const row of assignmentRows) {
    const resource = byAssignmentId.get(row.assignment_id);
    if (!resource) continue;
    const counts = breakdownToCounts(row.tardiness_breakdown, rosterSize);
    const bucket = ensureBucket(map, resource.id);
    bucket.students = row.students ?? counts.students;
    bucket.participations = row.participations ?? counts.participations;
    const pv = row.page_views ?? row.views;
    if (typeof pv === 'number' && pv > 0) {
      bucket.pageViews = pv;
    }
  }
}

async function fetchStudentIds(courseId: string): Promise<number[]> {
  const summaries = await fetchAllPages<StudentSummary>(
    `/courses/${courseId}/analytics/student_summaries`,
  );
  return summaries.map((s) => s.id).filter((id) => typeof id === 'number');
}

async function fetchUserParticipations(
  courseId: string,
  userId: number,
): Promise<ParticipationEvent[]> {
  try {
    const data = await canvasRequest<UserActivity>(
      `/courses/${courseId}/analytics/users/${userId}/activity`,
    );
    return data.participations ?? [];
  } catch {
    return [];
  }
}

export async function aggregateResourceMetricsFromStudents(
  courseId: string,
  resources: CourseResource[],
  _window: CourseActivityWindow,
  studentIds: number[],
): Promise<ResourceMetricsResult> {
  const byResourceId = new Map<number, ResourceMetrics>();
  for (const r of resources) {
    byResourceId.set(r.id, emptyMetrics());
  }

  const studentActivitySets = new Map<number, Set<number>>();
  const viewStudents = new Map<number, Set<number>>();

  let usageRowsFetched = 0;
  let usageRowsMatched = 0;
  let usageAvailable = false;

  await mapPool(studentIds, STUDENT_ACTIVITY_CONCURRENCY, async (userId) => {
    const events = await fetchUserParticipations(courseId, userId);
    for (const event of events) {
      if (!event.url) continue;
      const resource = findResourceForUrl(resources, event.url, courseId);
      if (!resource) continue;
      let set = studentActivitySets.get(resource.id);
      if (!set) {
        set = new Set();
        studentActivitySets.set(resource.id, set);
      }
      set.add(userId);
      const bucket = ensureBucket(byResourceId, resource.id);
      bucket.participations += 1;
    }
  });

  for (const [resourceId, set] of studentActivitySets) {
    const bucket = ensureBucket(byResourceId, resourceId);
    bucket.students = Math.max(bucket.students, set.size);
  }

  const pageViewsSampled = studentIds.length > PAGE_VIEW_ROSTER_CAP;
  const usageStudentIds = pageViewsSampled
    ? studentIds.slice(0, PAGE_VIEW_ROSTER_CAP)
    : studentIds;

  await mapPool(usageStudentIds, USAGE_FETCH_CONCURRENCY, async (userId) => {
    let rows: Awaited<ReturnType<typeof fetchCourseUserUsage>> = [];
    try {
      rows = await fetchCourseUserUsage(courseId, userId);
    } catch {
      return;
    }
    if (rows.length > 0) usageAvailable = true;
    usageRowsFetched += rows.length;

    for (const row of rows) {
      const views = usageViewCount(row);
      const parts = usageParticipationCount(row);
      if (views <= 0 && parts <= 0) continue;

      const resource = findResourceForUsageRow(resources, row);
      if (!resource) continue;
      usageRowsMatched += 1;

      const bucket = ensureBucket(byResourceId, resource.id);
      if (views > 0) {
        bucket.pageViews += views;
        let set = viewStudents.get(resource.id);
        if (!set) {
          set = new Set();
          viewStudents.set(resource.id, set);
        }
        set.add(userId);
      }
      if (parts > 0) {
        bucket.participations += parts;
      }
    }
  });

  for (const [resourceId, set] of viewStudents) {
    const bucket = ensureBucket(byResourceId, resourceId);
    bucket.students = Math.max(bucket.students, set.size);
  }

  return {
    byResourceId,
    pageViewsSampled,
    studentsScanned: studentIds.length,
    usageRowsFetched,
    usageRowsMatched,
    usageAvailable,
  };
}

export async function loadStudentIdsForResourceMetrics(courseId: string): Promise<number[]> {
  return fetchStudentIds(courseId);
}

export { breakdownToCounts };
