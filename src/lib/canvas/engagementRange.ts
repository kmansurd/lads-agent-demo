import { resolveSemesterWindow, semesterDataCutoff, type SemesterWindow } from './semesterWindow';
import { toIsoDateUtc } from './courseTimeline';

const MS_PER_DAY = 86400000;

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

export function defaultEngagementRange(today: Date = new Date()): {
  semester: SemesterWindow;
  range: EngagementRangeSelection;
} {
  const semester = resolveSemesterWindow(today);
  const end = semesterDataCutoff(semester, today);
  return {
    semester,
    range: { start: semester.start, end },
  };
}

export function resolveEngagementRange(
  startParam?: string | null,
  endParam?: string | null,
  today: Date = new Date(),
): { semester: SemesterWindow; range: EngagementRangeSelection; meta: EngagementRangeMeta } {
  const { semester, range: defaultRange } = defaultEngagementRange(today);
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
