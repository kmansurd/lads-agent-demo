'use client';

import React, { useMemo } from 'react';
import { Box, LinearProgress, Stack, Typography, useTheme } from '@mui/material';
import type { DailyAccessPattern, TimeOfDayPattern } from '@/lib/canvas/activityPatterns';
import { formatRangeLabel } from '@/lib/canvas/engagementRange';
import { chartPanelSx } from '@/theme/appleTheme';

function periodColors(isDark: boolean): Record<string, string> {
  return isDark
    ? {
        Morning: '#0a84ff',
        Afternoon: '#ffd60a',
        Evening: '#ff9f0a',
        Night: '#98989d',
      }
    : {
        Morning: '#0071e3',
        Afternoon: '#ff9500',
        Evening: '#bf4800',
        Night: '#86868b',
      };
}

function DayList({ title, days }: { title: string; days: { date: string; views: number }[] }) {
  return (
    <Box sx={{ flex: 1, minWidth: 180 }}>
      <Typography variant="subtitle2" gutterBottom>
        {title}
      </Typography>
      {days.map((day) => (
        <Typography key={day.date} variant="body2" color="text.secondary">
          {formatRangeLabel(day.date)} · {day.views.toLocaleString()} views
        </Typography>
      ))}
    </Box>
  );
}

export function ActivityPatternPanel({
  daily,
  timeOfDay,
  timeOfDayLoading = false,
}: {
  daily: DailyAccessPattern;
  timeOfDay: TimeOfDayPattern | null;
  timeOfDayLoading?: boolean;
}) {
  const theme = useTheme();
  const isDark = theme.palette.mode === 'dark';
  const periodColor = useMemo(() => periodColors(isDark), [isDark]);
  const recentWeeks = daily.weekChanges.slice(-4);

  return (
    <Box sx={{ ...chartPanelSx }}>
      <Typography variant="h6" gutterBottom>
        Access patterns
      </Typography>
      <Typography variant="body2">{daily.narrative}</Typography>
      {timeOfDay ? (
        <Typography variant="body2" sx={{ mt: 0.5 }}>
          {timeOfDayLoading ? 'Updating time of day for this range…' : timeOfDay.narrative}
        </Typography>
      ) : null}
      <Typography variant="caption" color="text.secondary" display="block" sx={{ mt: 1 }}>
        Busiest and quietest days use course-wide analytics. Time of day uses hourly page views
        for scanned students.
      </Typography>

      <Stack direction="row" spacing={2} useFlexGap flexWrap="wrap" sx={{ mt: 2 }}>
        <Stat label="Page views" value={daily.totalViews.toLocaleString()} />
        <Stat label="Per day" value={daily.avgViewsPerDay.toLocaleString()} />
        <Stat label="Active days" value={`${daily.activeDays} / ${daily.totalDays}`} />
        <Stat label="Latest 7-day avg" value={daily.latestRollingAverage.toLocaleString()} />
      </Stack>

      {timeOfDay && timeOfDay.totalViews > 0 ? (
        <Box sx={{ mt: 2 }}>
          <Typography variant="subtitle2" gutterBottom>
            Time of day
          </Typography>
          <Stack direction="row" spacing={2} useFlexGap flexWrap="wrap">
            {timeOfDay.periods.map((period) => (
              <Box key={period.period} sx={{ flex: '1 1 140px', minWidth: 140 }}>
                <Typography variant="caption" color="text.secondary">
                  {period.period}
                </Typography>
                <LinearProgress
                  variant="determinate"
                  value={Math.min(100, period.percentage)}
                  sx={{
                    my: 0.5,
                    height: 8,
                    borderRadius: 4,
                    bgcolor: isDark ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.08)',
                    '& .MuiLinearProgress-bar': {
                      backgroundColor: periodColor[period.period] ?? periodColor.Morning,
                    },
                  }}
                />
                <Typography variant="caption" color="text.secondary">
                  {period.percentage}% · {period.views.toLocaleString()}
                </Typography>
              </Box>
            ))}
          </Stack>
          {timeOfDay.peakHours.length > 0 ? (
            <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
              Peak hours:{' '}
              {timeOfDay.peakHours
                .map((hour) => `${hour.label} (${hour.views.toLocaleString()})`)
                .join(', ')}
            </Typography>
          ) : null}
        </Box>
      ) : null}

      {daily.totalViews > 0 ? (
        <Stack direction="row" spacing={3} useFlexGap flexWrap="wrap" sx={{ mt: 2 }}>
          <DayList title="Busiest days" days={daily.topDays} />
          <DayList title="Quietest days" days={daily.bottomDays} />
          <Box sx={{ flex: 1, minWidth: 200 }}>
            <Typography variant="subtitle2" gutterBottom>
              Recent weeks
            </Typography>
            {recentWeeks.map((week) => (
              <Typography key={week.label} variant="body2" color="text.secondary">
                {week.label}: {week.views.toLocaleString()}
                {week.changePct == null ? '' : ` (${week.changePct > 0 ? '+' : ''}${week.changePct}%)`}
              </Typography>
            ))}
          </Box>
        </Stack>
      ) : null}
    </Box>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <Box sx={{ minWidth: 120 }}>
      <Typography variant="caption" color="text.secondary">
        {label}
      </Typography>
      <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>
        {value}
      </Typography>
    </Box>
  );
}
