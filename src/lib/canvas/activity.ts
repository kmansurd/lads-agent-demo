import { canvasRequest, fetchAllPages, mapPool } from './client';

type CanvasCourse = {
  start_at?: string | null;
  end_at?: string | null;
};

type ActivityEvent = {
  created_at?: string;
  type?: string;
  title?: string;
};

type CanvasAssignment = {
  id: number;
  name: string;
  published?: boolean;
  submission_types?: string[];
};

type CanvasSubmission = {
  user_id: number;
  submitted_at?: string | null;
  workflow_state?: string;
};

type CanvasModuleItem = {
  id: number;
  title: string;
  type: string;
  content_id?: number;
  page_url?: string;
};

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
  type: 'home' | 'assignment' | 'file';
};

export type WeeklyActivityPayload = {
  chart: WeeklyActivityChart;
  resources: ResourceActivityRow[];
};

const WEEK_COUNT = 16;

function startOfWeek(date: Date): Date {
  const d = new Date(date);
  const day = d.getUTCDay();
  const diff = (day === 0 ? -6 : 1) - day;
  d.setUTCDate(d.getUTCDate() + diff);
  d.setUTCHours(0, 0, 0, 0);
  return d;
}

function buildWeekBuckets(courseStart: Date): { label: string; start: Date; end: Date }[] {
  const anchor = startOfWeek(courseStart);
  const buckets: { label: string; start: Date; end: Date }[] = [];

  for (let i = 0; i < WEEK_COUNT; i++) {
    const start = new Date(anchor);
    start.setUTCDate(start.getUTCDate() + i * 7);
    const end = new Date(start);
    end.setUTCDate(end.getUTCDate() + 7);
    buckets.push({
      label: `Week ${i + 1}`,
      start,
      end,
    });
  }
  return buckets;
}

function bucketIndex(isoDate: string, buckets: { start: Date; end: Date }[]): number {
  const t = new Date(isoDate).getTime();
  for (let i = 0; i < buckets.length; i++) {
    if (t >= buckets[i].start.getTime() && t < buckets[i].end.getTime()) return i;
  }
  return -1;
}

function resourceTypeFromModule(type: string): ResourceActivityRow['type'] {
  if (type === 'Assignment') return 'assignment';
  if (type === 'Page' || type === 'File' || type === 'ExternalUrl') return 'file';
  return 'home';
}

/**
 * Weekly engagement derived from Canvas REST data (no canvas-mcp):
 * - "Participations": submission timestamps + discussion-related activity events
 * - "Page views" proxy: all course activity stream events (views, submissions, updates)
 *   Canvas does not expose weekly page-view time series on the public API; the activity
 *   feed is the closest institution-agnostic signal.
 */
export async function getWeeklyActivity(courseId: string): Promise<WeeklyActivityPayload> {
  const course = await canvasRequest<CanvasCourse>(`/courses/${courseId}`);

  const courseStart = course.start_at ? new Date(course.start_at) : new Date();
  if (Number.isNaN(courseStart.getTime())) {
    courseStart.setTime(Date.now() - WEEK_COUNT * 7 * 86400000);
  }

  const buckets = buildWeekBuckets(courseStart);
  const pageViews = new Array(WEEK_COUNT).fill(0);
  const participations = new Array(WEEK_COUNT).fill(0);

  let activityNote =
    'Page views estimated from the Canvas course activity stream; participations from submissions and discussion activity.';

  try {
    const events = await fetchAllPages<ActivityEvent>(`/courses/${courseId}/activity`);
    for (const event of events) {
      if (!event.created_at) continue;
      const idx = bucketIndex(event.created_at, buckets);
      if (idx < 0) continue;
      pageViews[idx] += 1;
      const type = (event.type ?? '').toLowerCase();
      if (
        type.includes('discussion') ||
        type.includes('submission') ||
        type.includes('conversation')
      ) {
        participations[idx] += 1;
      }
    }
  } catch {
    activityNote =
      'Activity stream unavailable; weekly metrics built from assignment submissions only.';
  }

  const assignments = await fetchAllPages<CanvasAssignment>(`/courses/${courseId}/assignments`);
  const published = assignments.filter((a) => a.published !== false);

  const resourceStats = new Map<
    number,
    { name: string; students: Set<number>; submissions: number; type: ResourceActivityRow['type'] }
  >();

  for (const a of published) {
    resourceStats.set(a.id, {
      name: a.name,
      students: new Set(),
      submissions: 0,
      type: 'assignment',
    });
  }

  await mapPool(published.slice(0, 40), 5, async (assignment) => {
    let submissions: CanvasSubmission[] = [];
    try {
      submissions = await fetchAllPages<CanvasSubmission>(
        `/courses/${courseId}/assignments/${assignment.id}/submissions`,
      );
    } catch {
      return;
    }

    const stat = resourceStats.get(assignment.id);
    if (!stat) return;

    for (const sub of submissions) {
      if (!sub.submitted_at) continue;
      stat.submissions += 1;
      stat.students.add(sub.user_id);

      const idx = bucketIndex(sub.submitted_at, buckets);
      if (idx >= 0) {
        participations[idx] += 1;
        if (pageViews.every((v) => v === 0)) {
          pageViews[idx] += 1;
        }
      }
    }
  });

  if (pageViews.every((v) => v === 0)) {
    for (let i = 0; i < WEEK_COUNT; i++) {
      pageViews[i] = participations[i];
    }
    activityNote =
      'Course activity stream empty; both series use submission timestamps (participation proxy).';
  }

  let moduleItems: CanvasModuleItem[] = [];
  try {
    const modules = await fetchAllPages<{ id: number }>(`/courses/${courseId}/modules`);
    const itemLists = await mapPool(modules.slice(0, 20), 4, async (mod) =>
      fetchAllPages<CanvasModuleItem>(`/courses/${courseId}/modules/${mod.id}/items`),
    );
    moduleItems = itemLists.flat();
  } catch {
    moduleItems = [];
  }

  const resources: ResourceActivityRow[] = [];

  let rowId = 1;
  for (const a of published.slice(0, 30)) {
    const stat = resourceStats.get(a.id);
    resources.push({
      id: rowId++,
      resource: a.name,
      students: stat?.students.size ?? 0,
      pageViews: stat?.submissions ?? 0,
      participations: stat?.submissions ?? 0,
      type: 'assignment',
    });
  }

  for (const item of moduleItems.slice(0, 25)) {
    if (item.type === 'Assignment') continue;
    resources.push({
      id: rowId++,
      resource: item.title,
      students: 0,
      pageViews: 0,
      participations: 0,
      type: resourceTypeFromModule(item.type),
    });
  }

  return {
    chart: {
      labels: buckets.map((b) => b.label),
      pageViews,
      participations,
      note: activityNote,
    },
    resources,
  };
}
