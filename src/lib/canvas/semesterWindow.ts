import { toIsoDateUtc } from './courseTimeline';

const SEMESTER_WEEKS = 15;
const MS_PER_DAY = 86400000;
const MS_PER_WEEK = 7 * MS_PER_DAY;

export type SemesterKind = 'Fall' | 'Spring';

export type SemesterWindow = {
  kind: SemesterKind;
  year: number;
  start: Date;
  end: Date;
  sourceNote: string;
};

/** Local calendar date at noon to avoid DST edge cases when bucketing weeks. */
function localNoon(year: number, monthIndex: number, day: number): Date {
  return new Date(year, monthIndex, day, 12, 0, 0, 0);
}

export function semesterBounds(
  kind: SemesterKind,
  year: number,
): { start: Date; end: Date } {
  if (kind === 'Spring') {
    const start = localNoon(year, 0, 2);
    const end = new Date(start.getTime() + SEMESTER_WEEKS * MS_PER_WEEK - MS_PER_DAY);
    return { start, end };
  }
  const start = localNoon(year, 7, 25);
  const end = new Date(start.getTime() + SEMESTER_WEEKS * MS_PER_WEEK - MS_PER_DAY);
  return { start, end };
}

function containsDate(date: Date, start: Date, end: Date): boolean {
  const t = date.getTime();
  return t >= start.getTime() && t <= end.getTime();
}

/** Parse Canvas enrollment term labels such as "2023-24 FALL" or "2025-26 SPRING". */
export function parseTermNameToSemester(
  name: string | null | undefined,
): { kind: SemesterKind; year: number } | null {
  if (!name?.trim()) return null;
  const upper = name.toUpperCase();
  const kind: SemesterKind | null = upper.includes('SPRING')
    ? 'Spring'
    : upper.includes('FALL')
      ? 'Fall'
      : null;
  if (!kind) return null;
  const match = name.match(/(\d{4})/);
  if (!match) return null;
  return { kind, year: Number(match[1]) };
}

export function semesterWindowFromKindYear(
  kind: SemesterKind,
  year: number,
  sourceNote: string,
): SemesterWindow {
  const bounds = semesterBounds(kind, year);
  return { kind, year, start: bounds.start, end: bounds.end, sourceNote };
}

/**
 * Academic semester windows (15 weeks):
 * - Spring: Jan 2 → 15 weeks
 * - Fall: Aug 25 (one week before Sep 1) → 15 weeks
 */
export function resolveSemesterWindow(today: Date = new Date()): SemesterWindow {
  const year = today.getFullYear();
  const spring = semesterBounds('Spring', year);
  const fall = semesterBounds('Fall', year);

  if (containsDate(today, spring.start, spring.end)) {
    return {
      kind: 'Spring',
      year,
      start: spring.start,
      end: spring.end,
      sourceNote: `Chart window: Spring ${year} (Jan 2 – ${toIsoDateUtc(spring.end)}, ${SEMESTER_WEEKS} weeks).`,
    };
  }

  if (containsDate(today, fall.start, fall.end)) {
    return {
      kind: 'Fall',
      year,
      start: fall.start,
      end: fall.end,
      sourceNote: `Chart window: Fall ${year} (Aug 25 – ${toIsoDateUtc(fall.end)}, ${SEMESTER_WEEKS} weeks).`,
    };
  }

  const prevFall = semesterBounds('Fall', year - 1);
  const nextSpring = semesterBounds('Spring', year + 1);

  if (today.getTime() < spring.start.getTime()) {
    if (today.getTime() > prevFall.end.getTime()) {
      return {
        kind: 'Spring',
        year,
        start: spring.start,
        end: spring.end,
        sourceNote: `Chart window: Spring ${year} (upcoming; ${SEMESTER_WEEKS} weeks from Jan 2).`,
      };
    }
    return {
      kind: 'Fall',
      year: year - 1,
      start: prevFall.start,
      end: prevFall.end,
      sourceNote: `Chart window: Fall ${year - 1} (most recent; ${SEMESTER_WEEKS} weeks from Aug 25).`,
    };
  }

  if (today.getTime() > fall.end.getTime()) {
    return {
      kind: 'Fall',
      year,
      start: fall.start,
      end: fall.end,
      sourceNote: `Chart window: Fall ${year} (most recent; ${SEMESTER_WEEKS} weeks from Aug 25).`,
    };
  }

  if (today.getTime() > spring.end.getTime() && today.getTime() < fall.start.getTime()) {
    return {
      kind: 'Spring',
      year,
      start: spring.start,
      end: spring.end,
      sourceNote: `Chart window: Spring ${year} (${SEMESTER_WEEKS} weeks from Jan 2).`,
    };
  }

  return {
    kind: 'Spring',
    year: year + 1,
    start: nextSpring.start,
    end: nextSpring.end,
    sourceNote: `Chart window: Spring ${year + 1} (${SEMESTER_WEEKS} weeks from Jan 2).`,
  };
}

/** Last day to include in analytics daily rows (do not count future days). */
export function semesterDataCutoff(semester: SemesterWindow, today: Date = new Date()): Date {
  const t = today.getTime();
  if (t < semester.start.getTime()) return semester.start;
  if (t > semester.end.getTime()) return semester.end;
  return today;
}
