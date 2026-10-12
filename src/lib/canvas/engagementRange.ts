import {
  parseTermNameToSemester,
  resolveSemesterWindow,
  semesterBounds,
  semesterDataCutoff,
  semesterWindowFromKindYear,
  type SemesterWindow,
} from './semesterWindow';
import { toIsoDateUtc, type CanvasCourseTimeline } from './courseTimeline';

const MS_PER_DAY = 86400000;
const SEMESTER_WEEKS = 15;

export type EngagementRangeSelection = {
  start: Date;
  end: Date;
};

export type EngagementRangeMeta = {
  semesterKind: SemesterWindow['kind'];
  semesterYear: number;
  semesterStart: string;
  semesterEnd: string;
  /** Latest selectable end (today or semester end, whichever is earlier). */
  sliderMax: string;
  selectedStart: string;
  selectedEnd: string;
};

export type ResolveEngagementRangeOptions = {
  course?: CanvasCourseTimeline | null;
  termLabel?: string | null;
  today?: Date;
};

function parseCanvasInstant(iso?: string | null): Date | null {
  if (!iso) return null;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d;
}

function toLocalNoon(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 12, 0, 0, 0);
}

/**
 * Engagement sliders and default chart range follow this course offering (not the calendar semester around today).
 * Past terms end at Canvas term/course end — not extended through today.
 */
export function resolveEngagementSemesterForCourse(
  course: CanvasCourseTimeline,
  termLabel?: string | null,
  today: Date = new Date(),
): SemesterWindow {
  const label = termLabel ?? course.term?.name ?? null;
  const parsedTerm = parseTermNameToSemester(label);

  const termStart = parseCanvasInstant(course.term?.start_at);
  const termEnd = parseCanvasInstant(course.term?.end_at);
  const courseStart = parseCanvasInstant(course.start_at);
  const courseEnd = parseCanvasInstant(course.end_at);
  const created = parseCanvasInstant(course.created_at);

  const hasCanvasDates = !!(termStart || termEnd || courseStart || courseEnd);

  if (hasCanvasDates) {
    const fallbackStart = parsedTerm
      ? semesterBounds(parsedTerm.kind, parsedTerm.year).start
      : today;
    const fallbackEnd = parsedTerm
      ? semesterBounds(parsedTerm.kind, parsedTerm.year).end
      : today;

    const start = toLocalNoon(courseStart ?? termStart ?? created ?? fallbackStart);
    const scheduledEnd = courseEnd ?? termEnd ?? fallbackEnd;
    let end = toLocalNoon(scheduledEnd);

    if (start.getTime() > end.getTime()) {
      end = start;
    }

    const kind = parsedTerm?.kind ?? (start.getMonth() >= 7 ? 'Fall' : 'Spring');
    const year = parsedTerm?.year ?? start.getFullYear();

    let sourceNote: string;
    if (courseStart || courseEnd) {
      sourceNote = `Chart window: this course offering (${toIsoDateUtc(start)} – ${toIsoDateUtc(end)}) from Canvas course dates.`;
    } else {
      const termSuffix = label ? ` (${label})` : '';
      sourceNote = `Chart window: enrollment term${termSuffix} (${toIsoDateUtc(start)} – ${toIsoDateUtc(end)}) from Canvas.`;
    }

    return { kind, year, start, end, sourceNote };
  }

  if (parsedTerm) {
    return semesterWindowFromKindYear(
      parsedTerm.kind,
      parsedTerm.year,
      `Chart window: ${parsedTerm.kind} ${parsedTerm.year} from term name “${label}” (${SEMESTER_WEEKS}-week template).`,
    );
  }

  return resolveSemesterWindow(today);
}

export function parseIsoDateLocal(iso: string): Date | null {
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return null;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 12, 0, 0, 0);
  return Number.isNaN(d.getTime()) ? null : d;
}

export function dayIndexFromSemesterStart(semesterStart: Date, date: Date): number {
  return Math.round((date.getTime() - semesterStart.getTime()) / MS_PER_DAY);
}

export function dateFromDayIndex(semesterStart: Date, index: number): Date {
  return new Date(semesterStart.getTime() + index * MS_PER_DAY);
}

export function defaultEngagementRange(
  options: ResolveEngagementRangeOptions = {},
): {
  semester: SemesterWindow;
  range: EngagementRangeSelection;
} {
  const today = options.today ?? new Date();
  const semester = options.course
    ? resolveEngagementSemesterForCourse(options.course, options.termLabel, today)
    : resolveSemesterWindow(today);
  const end = semesterDataCutoff(semester, today);
  return {
    semester,
    range: { start: semester.start, end },
  };
}

export function resolveEngagementRange(
  startParam?: string | null,
  endParam?: string | null,
  options: ResolveEngagementRangeOptions = {},
): { semester: SemesterWindow; range: EngagementRangeSelection; meta: EngagementRangeMeta } {
  const today = options.today ?? new Date();
  const { semester, range: defaultRange } = defaultEngagementRange(options);
  const sliderMaxDate = semesterDataCutoff(semester, today);

  let start = defaultRange.start;
  let end = defaultRange.end;

  const parsedStart = startParam ? parseIsoDateLocal(startParam) : null;
  const parsedEnd = endParam ? parseIsoDateLocal(endParam) : null;

  if (parsedStart) {
    start = parsedStart;
  }
  if (parsedEnd) {
    end = parsedEnd;
  }

  if (start.getTime() < semester.start.getTime()) {
    start = semester.start;
  }
  if (end.getTime() > sliderMaxDate.getTime()) {
    end = sliderMaxDate;
  }
  if (end.getTime() > semester.end.getTime()) {
    end = semester.end;
  }
  if (start.getTime() > end.getTime()) {
    start = end;
  }

  return {
    semester,
    range: { start, end },
    meta: {
      semesterKind: semester.kind,
      semesterYear: semester.year,
      semesterStart: toIsoDateUtc(semester.start),
      semesterEnd: toIsoDateUtc(semester.end),
      sliderMax: toIsoDateUtc(sliderMaxDate),
      selectedStart: toIsoDateUtc(start),
      selectedEnd: toIsoDateUtc(end),
    },
  };
}

export function formatRangeLabel(iso: string): string {
  const d = parseIsoDateLocal(iso);
  if (!d) return iso;
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}
