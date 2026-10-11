import { startOfWeekMondayUtc, toIsoDateUtc, weekLabel } from './courseTimeline';

export type DailyActivityPoint = {
  date: string;
  views: number;
  participations: number;
};

export function filterDailyToWindow(
  daily: DailyActivityPoint[],
  windowStart: Date,
  windowEnd: Date,
): DailyActivityPoint[] {
  const startKey = toIsoDateUtc(windowStart);
  const endKey = toIsoDateUtc(windowEnd);
  return daily.filter((d) => d.date >= startKey && d.date <= endKey);
}

export function aggregateDailyToWeekly(
  daily: DailyActivityPoint[],
  windowStart: Date,
  windowEnd: Date,
): { labels: string[]; pageViews: number[]; participations: number[] } {
  const anchor = startOfWeekMondayUtc(windowStart);
  const endWeekIndex = Math.max(
    0,
    Math.floor((windowEnd.getTime() - anchor.getTime()) / (7 * 86400000)),
  );

  const weekMap = new Map<number, { views: number; participations: number }>();

  for (const entry of daily) {
    const day = new Date(`${entry.date}T12:00:00.000Z`);
    if (Number.isNaN(day.getTime())) continue;
    const weekIndex = Math.floor((day.getTime() - anchor.getTime()) / (7 * 86400000));
    if (weekIndex < 0 || weekIndex > endWeekIndex) continue;
    const cur = weekMap.get(weekIndex) ?? { views: 0, participations: 0 };
    weekMap.set(weekIndex, {
      views: cur.views + entry.views,
      participations: cur.participations + entry.participations,
    });
  }

  const labels: string[] = [];
  const pageViews: number[] = [];
  const participations: number[] = [];

  for (let i = 0; i <= endWeekIndex; i++) {
    labels.push(weekLabel(i, anchor));
    const bucket = weekMap.get(i) ?? { views: 0, participations: 0 };
    pageViews.push(bucket.views);
    participations.push(bucket.participations);
  }

  return { labels, pageViews, participations };
}
