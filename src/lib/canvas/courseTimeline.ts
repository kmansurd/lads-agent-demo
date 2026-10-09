type CanvasTerm = {
  start_at?: string | null;
  end_at?: string | null;
  name?: string | null;
};

export type CanvasCourseTimeline = {
  start_at?: string | null;
  end_at?: string | null;
  created_at?: string | null;
  workflow_state?: string | null;
  term?: CanvasTerm | null;
};

export type CourseActivityWindow = {
  start: Date;
  end: Date;
  /** Human-readable note about which Canvas dates anchored the window. */
  sourceNote: string;
};

function parseDate(iso?: string | null): Date | null {
  if (!iso) return null;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** ISO date (YYYY-MM-DD) in UTC for filtering Canvas daily analytics rows. */
export function toIsoDateUtc(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/**
 * Resolve the reporting window Canvas uses when course dates are unset:
 * course start/end, else enrollment term, else course created_at → today.
 */
export function resolveCourseActivityWindow(course: CanvasCourseTimeline): CourseActivityWindow {
  const start =
    parseDate(course.start_at) ??
    parseDate(course.term?.start_at) ??
    parseDate(course.created_at);

  const today = new Date();
  const scheduledEnd =
    parseDate(course.end_at) ?? parseDate(course.term?.end_at) ?? today;

  let startDate =
    start ??
    (() => {
      const d = new Date(scheduledEnd);
      d.setUTCDate(d.getUTCDate() - 90);
      return d;
    })();

  let endDate = scheduledEnd;
  if (endDate.getTime() < startDate.getTime()) {
    endDate = today;
  }

  // Courses often stay available after the enrollment term ends; Canvas analytics
  // keeps accumulating views. Extend the window through today unless concluded.
  const concluded =
    course.workflow_state === 'completed' ||
    course.workflow_state === 'deleted' ||
    course.workflow_state === 'unpublished';
  if (!concluded && endDate.getTime() < today.getTime()) {
    endDate = today;
  }

  let sourceNote = 'Weeks anchored to course start and end dates from Canvas.';
  if (!course.start_at && !course.end_at) {
    if (course.term?.start_at || course.term?.end_at) {
      const termLabel = course.term?.name ? ` (${course.term.name})` : '';
      sourceNote = `Course dates unset; using enrollment term${termLabel} start/end from Canvas.`;
    } else if (course.created_at) {
      sourceNote =
        'Course and term dates unset; weeks run from course created_at through today.';
    }
  }

  return { start: startDate, end: endDate, sourceNote };
}

export function startOfWeekMondayUtc(date: Date): Date {
  const d = new Date(date);
  const day = d.getUTCDay();
  const diff = (day === 0 ? -6 : 1) - day;
  d.setUTCDate(d.getUTCDate() + diff);
  d.setUTCHours(0, 0, 0, 0);
  return d;
}

function formatShortUtc(d: Date): string {
  return d.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  });
}

export function weekLabel(weekIndex: number, anchorMonday: Date): string {
  const weekStart = new Date(anchorMonday);
  weekStart.setUTCDate(weekStart.getUTCDate() + weekIndex * 7);
  const weekEnd = new Date(weekStart);
  weekEnd.setUTCDate(weekEnd.getUTCDate() + 6);
  return `Week ${weekIndex + 1} (${formatShortUtc(weekStart)} – ${formatShortUtc(weekEnd)})`;
}
