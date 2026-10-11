import { aggregateDailyToWeekly } from './engagementChart';
import { startOfWeekMondayUtc, toIsoDateUtc, weekLabel } from './courseTimeline';

export type RankedDay = {
  date: string;
  views: number;
};

export type WeekChange = {
  label: string;
  views: number;
  changePct: number | null;
};

export type DailyAccessPattern = {
  totalViews: number;
  activeDays: number;
  totalDays: number;
  avgViewsPerDay: number;
  latestRollingAverage: number;
  topDays: RankedDay[];
  bottomDays: RankedDay[];
  weekChanges: WeekChange[];
  narrative: string;
};

export type TimeOfDayPeriodName = 'Morning' | 'Afternoon' | 'Evening' | 'Night';

export type TimeOfDayPeriod = {
  period: TimeOfDayPeriodName;
  views: number;
  percentage: number;
};

export type PeakHour = {
  hour: number;
  label: string;
  views: number;
  percentage: number;
};

export type TimeOfDayPattern = {
  periods: TimeOfDayPeriod[];
  peakHours: PeakHour[];
  totalViews: number;
  studentsScanned: number;
  narrative: string;
};

export type StudentRangeRhythm = {
  activeDays: number;
  avgDailyViews: number;
  quietDays: number;
  longestQuietDays: number;
  engagementRate: number;
  weeklyViews: number[];
};

const PERIOD_ORDER: TimeOfDayPeriodName[] = ['Morning', 'Afternoon', 'Evening', 'Night'];

export function eachIsoDayInclusive(startIso: string, endIso: string): string[] {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(startIso) || !/^\d{4}-\d{2}-\d{2}$/.test(endIso)) return [];
  if (startIso > endIso) return [];
  const [year, month, day] = startIso.split('-').map(Number);
  const cursor = new Date(Date.UTC(year, month - 1, day));
  const days: string[] = [];
  while (days.length < 400) {
    const key = cursor.toISOString().slice(0, 10);
    if (key > endIso) break;
    days.push(key);
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return days;
}

export function formatHourLabel(hour: number): string {
  if (hour === 0) return '12 AM';
  if (hour < 12) return `${hour} AM`;
  if (hour === 12) return '12 PM';
  return `${hour - 12} PM`;
}

export function periodForHour(hour: number): TimeOfDayPeriodName {
  if (hour >= 5 && hour <= 11) return 'Morning';
  if (hour >= 12 && hour <= 16) return 'Afternoon';
  if (hour >= 17 && hour <= 21) return 'Evening';
  return 'Night';
}

function rangeKeys(start: Date, end: Date): { startKey: string; endKey: string } {
  return { startKey: toIsoDateUtc(start), endKey: toIsoDateUtc(end) };
}

function hourFromKey(hourKey: string): number | null {
  const match = hourKey.match(/T(\d{2}):/);
  if (!match) return null;
  const hour = Number(match[1]);
  return hour >= 0 && hour <= 23 ? hour : null;
}

/** Split one student's hourly analytics buckets into day and clock-hour totals. */
export function sliceHourlyPageViews(
  pageViews: Record<string, number> | undefined,
  start: Date,
  end: Date,
): { total: number; byDay: Map<string, number>; byHour: number[] } {
  const byDay = new Map<string, number>();
  const byHour = new Array<number>(24).fill(0);
  let total = 0;
  if (!pageViews) return { total, byDay, byHour };

  const { startKey, endKey } = rangeKeys(start, end);
  for (const [hourKey, count] of Object.entries(pageViews)) {
    if (typeof count !== 'number' || count <= 0) continue;
    const ts = Date.parse(hourKey);
    if (Number.isNaN(ts)) continue;
    const dayKey = toIsoDateUtc(new Date(ts));
    if (dayKey < startKey || dayKey > endKey) continue;
    const hour = hourFromKey(hourKey);
    if (hour == null) continue;
    total += count;
    byDay.set(dayKey, (byDay.get(dayKey) ?? 0) + count);
    byHour[hour] += count;
  }
  return { total, byDay, byHour };
}

export function addHourlyPageViews(
  histogram: number[],
  pageViews: Record<string, number> | undefined,
  start: Date,
  end: Date,
): number {
  const slice = sliceHourlyPageViews(pageViews, start, end);
  for (let hour = 0; hour < 24; hour += 1) {
    histogram[hour] = (histogram[hour] ?? 0) + slice.byHour[hour];
  }
  return slice.total;
}

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

function pct(part: number, whole: number): number {
  if (whole <= 0) return 0;
  return round1((part / whole) * 100);
}

function pctChange(current: number, previous: number): number | null {
  if (previous <= 0) return null;
  return Math.round(((current - previous) / previous) * 100);
}

function formatDay(iso: string): string {
  const [year, month, day] = iso.split('-').map(Number);
  const date = new Date(year, month - 1, day);
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export function studentRhythmFromHourly(
  pageViews: Record<string, number> | undefined,
  start: Date,
  end: Date,
): StudentRangeRhythm {
  const { total, byDay } = sliceHourlyPageViews(pageViews, start, end);
  const { startKey, endKey } = rangeKeys(start, end);
  const days = eachIsoDayInclusive(startKey, endKey);
  const totalDays = Math.max(days.length, 1);

  let activeDays = 0;
  let longestQuietDays = 0;
  let quietStreak = 0;
  for (const day of days) {
    const views = byDay.get(day) ?? 0;
    if (views > 0) {
      activeDays += 1;
      quietStreak = 0;
    } else {
      quietStreak += 1;
      if (quietStreak > longestQuietDays) longestQuietDays = quietStreak;
    }
  }

  const quietDays = days.length - activeDays;
  const weekly = aggregateDailyToWeekly(
    [...byDay.entries()].map(([date, views]) => ({ date, views, participations: 0 })),
    start,
    end,
  );

  return {
    activeDays,
    avgDailyViews: round1(total / totalDays),
    quietDays,
    longestQuietDays,
    engagementRate: Math.round((activeDays / totalDays) * 100),
    weeklyViews: weekly.pageViews,
  };
}

export function analyzeDailyAccess(
  daily: { date: string; views: number }[],
  start: Date,
  end: Date,
): DailyAccessPattern {
  const { startKey, endKey } = rangeKeys(start, end);
  const days = eachIsoDayInclusive(startKey, endKey);
  const viewsByDay = new Map<string, number>();
  for (const row of daily) {
    if (row.date < startKey || row.date > endKey) continue;
    viewsByDay.set(row.date, (viewsByDay.get(row.date) ?? 0) + row.views);
  }

  const series = days.map((date) => ({ date, views: viewsByDay.get(date) ?? 0 }));
  const totalViews = series.reduce((sum, row) => sum + row.views, 0);
  const activeDays = series.filter((row) => row.views > 0).length;
  const totalDays = series.length;
  const avgViewsPerDay = totalDays > 0 ? round1(totalViews / totalDays) : 0;

  let rolling = 0;
  if (series.length > 0) {
    const window = series.slice(-7);
    rolling = round1(window.reduce((sum, row) => sum + row.views, 0) / window.length);
  }

  const ranked = [...series].sort(
    (a, b) => b.views - a.views || a.date.localeCompare(b.date),
  );
  const topDays = ranked.slice(0, 5);
  const topKeys = new Set(topDays.map((row) => row.date));
  const bottomPool = [...series]
    .filter((row) => !topKeys.has(row.date))
    .sort((a, b) => a.views - b.views || a.date.localeCompare(b.date));
  const bottomDays = (bottomPool.length > 0 ? bottomPool : [...series].reverse()).slice(0, 5);

  const weekly = aggregateDailyToWeekly(
    series.map((row) => ({ ...row, participations: 0 })),
    start,
    end,
  );
  const weekChanges: WeekChange[] = weekly.pageViews.map((views, index) => ({
    label: weekly.labels[index] ?? `Week ${index + 1}`,
    views,
    changePct: index === 0 ? null : pctChange(views, weekly.pageViews[index - 1] ?? 0),
  }));

  return {
    totalViews,
    activeDays,
    totalDays,
    avgViewsPerDay,
    latestRollingAverage: rolling,
    topDays,
    bottomDays,
    weekChanges,
    narrative: dailyNarrative({
      startKey,
      endKey,
      totalViews,
      activeDays,
      avgViewsPerDay,
      latestRollingAverage: rolling,
      topDays,
      weekChanges,
    }),
  };
}

function dailyNarrative(input: {
  startKey: string;
  endKey: string;
  totalViews: number;
  activeDays: number;
  avgViewsPerDay: number;
  latestRollingAverage: number;
  topDays: RankedDay[];
  weekChanges: WeekChange[];
}): string {
  const span = `${formatDay(input.startKey)}–${formatDay(input.endKey)}`;
  if (input.totalViews <= 0) {
    return `No course-wide page views from ${span}.`;
  }
  const busiest = input.topDays[0];
  const latest = input.weekChanges.at(-1);
  const prior = input.weekChanges.length > 1 ? input.weekChanges.at(-2) : undefined;
  let weekSentence = '';
  if (latest && prior) {
    if (latest.changePct == null) {
      weekSentence = ` The latest week has ${latest.views.toLocaleString()} page views after a week with none.`;
    } else if (latest.changePct === 0) {
      weekSentence = ` The latest week is flat versus the week before (${latest.views.toLocaleString()} page views).`;
    } else {
      const direction = latest.changePct > 0 ? 'up' : 'down';
      weekSentence = ` The latest week is ${direction} ${Math.abs(latest.changePct)}% from the week before (${latest.views.toLocaleString()} page views).`;
    }
  }
  const busySentence = busiest
    ? ` Busiest day was ${formatDay(busiest.date)} (${busiest.views.toLocaleString()} views).`
    : '';
  return `${span}: ${input.totalViews.toLocaleString()} course page views on ${input.activeDays} active days (${input.avgViewsPerDay.toLocaleString()} per day). The latest 7-day average is ${input.latestRollingAverage.toLocaleString()} views per day.${busySentence}${weekSentence}`;
}

export function timeOfDayFromHistogram(
  hours: number[],
  studentsScanned: number,
): TimeOfDayPattern {
  const totals = new Map<TimeOfDayPeriodName, number>(
    PERIOD_ORDER.map((period) => [period, 0]),
  );
  let totalViews = 0;
  for (let hour = 0; hour < 24; hour += 1) {
    const views = hours[hour] ?? 0;
    totalViews += views;
    const period = periodForHour(hour);
    totals.set(period, (totals.get(period) ?? 0) + views);
  }

  const periods: TimeOfDayPeriod[] = PERIOD_ORDER.map((period) => ({
    period,
    views: totals.get(period) ?? 0,
    percentage: pct(totals.get(period) ?? 0, totalViews),
  }));

  const peakHours: PeakHour[] = hours
    .map((views, hour) => ({
      hour,
      label: formatHourLabel(hour),
      views: views ?? 0,
      percentage: pct(views ?? 0, totalViews),
    }))
    .filter((row) => row.views > 0)
    .sort((a, b) => b.views - a.views || a.hour - b.hour)
    .slice(0, 5);

  const lead = [...periods].sort((a, b) => b.views - a.views)[0];
  const peak = peakHours[0];
  let narrative = 'No hourly page views in this range for the scanned students.';
  if (totalViews > 0 && lead && peak) {
    narrative = `Among ${studentsScanned.toLocaleString()} scanned students, ${lead.period.toLowerCase()} accounts for ${lead.percentage}% of hourly page views. The peak hour is ${peak.label}.`;
  }

  return { periods, peakHours, totalViews, studentsScanned, narrative };
}

/** Week labels for a range, aligned with weeklyViews on each student row. */
export function weekLabelsForRange(start: Date, end: Date): string[] {
  const anchor = startOfWeekMondayUtc(start);
  const endWeekIndex = Math.max(
    0,
    Math.floor((end.getTime() - anchor.getTime()) / (7 * 86400000)),
  );
  const labels: string[] = [];
  for (let index = 0; index <= endWeekIndex; index += 1) {
    labels.push(weekLabel(index, anchor));
  }
  return labels;
}
