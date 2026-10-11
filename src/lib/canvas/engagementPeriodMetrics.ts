import { fetchAllPages, mapPool } from './client';
import type { CourseContentRow } from './courseContentCatalog';
import { toIsoDateUtc } from './courseTimeline';

type SubmissionRow = {
  user_id: number;
  submitted_at?: string | null;
  workflow_state?: string;
};

function submissionInRange(
  submittedAt: string | null | undefined,
  start: Date,
  end: Date,
): boolean {
  if (!submittedAt) return false;
  const day = submittedAt.slice(0, 10);
  const startKey = toIsoDateUtc(start);
  const endKey = toIsoDateUtc(end);
  return day >= startKey && day <= endKey;
}

/**
 * Assignment submissions in the selected date range (`submitted_at`).
 * Does not modify pageViews (see applyPageViewsForDateRange).
 */
export async function applyAssignmentMetricsForDateRange(
  courseId: string,
  content: CourseContentRow[],
  start: Date,
  end: Date,
): Promise<void> {
  const assignments = content.filter((row) => row.type === 'assignment');
  if (assignments.length === 0) return;

  for (const row of assignments) {
    row.participations = 0;
  }

  await mapPool(assignments, 5, async (row) => {
    let submissions: SubmissionRow[] = [];
    try {
      submissions = await fetchAllPages<SubmissionRow>(
        `/courses/${courseId}/assignments/${row.canvasId}/submissions`,
      );
    } catch {
      return;
    }

    const submitters = new Set<number>();
    let participations = 0;

    for (const sub of submissions) {
      if (!submissionInRange(sub.submitted_at, start, end)) continue;
      if (sub.workflow_state === 'unsubmitted') continue;
      participations += 1;
      submitters.add(sub.user_id);
    }

    row.participations = participations;

    const viewers = row.students ?? 0;
    row.students = Math.max(viewers, submitters.size);
  });
}
