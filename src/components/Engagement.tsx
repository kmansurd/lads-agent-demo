'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Line } from 'react-chartjs-2';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
} from 'chart.js';
import { DataGrid, GridColDef } from '@mui/x-data-grid';
import { Box, Typography, Alert, Chip, Slider, Stack } from '@mui/material';
import { useCourse } from '@/context/CourseContext';
import { TabLoader } from '@/components/CourseDataState';
import { ActivityPatternPanel } from '@/components/ActivityPatternPanel';
import { TabDataSourceFooter } from '@/components/TabDataSourceFooter';
import { useCourseCapabilities } from '@/hooks/useCourseCapabilities';
import { useCourseData } from '@/hooks/useCourseData';
import { analyzeDailyAccess, type TimeOfDayPattern } from '@/lib/canvas/activityPatterns';
import type { CourseEngagementPayload } from '@/lib/canvas/engagement';
import type { CourseContentType, CourseContentRow } from '@/lib/canvas/courseContentCatalog';
import {
  aggregateDailyToWeekly,
  filterDailyToWindow,
  type DailyActivityPoint,
} from '@/lib/canvas/engagementChart';
import {
  dateFromDayIndex,
  dayIndexFromSemesterStart,
  formatRangeLabel,
  parseIsoDateLocal,
} from '@/lib/canvas/engagementRange';
import { toIsoDateUtc } from '@/lib/canvas/courseTimeline';

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Title, Tooltip, Legend);

const formatCount = (value: unknown) =>
  value == null || value === '' ? '—' : Number(value).toLocaleString();

const typeLabel: Record<CourseContentType, string> = {
  page: 'Page',
  file: 'File',
  assignment: 'Assignment',
  quiz: 'Quiz',
  discussion: 'Discussion',
  module_item: 'Module item',
  external: 'External',
};

const contentColumns: GridColDef[] = [
  {
    field: 'type',
    headerName: 'Type',
    width: 120,
    valueFormatter: (value) => typeLabel[value as CourseContentType] ?? String(value),
  },
  { field: 'title', headerName: 'Title', flex: 1, minWidth: 220 },
  {
    field: 'published',
    headerName: 'Published',
    width: 110,
    renderCell: (params) => (
      <Chip
        size="small"
        label={params.value ? 'Yes' : 'No'}
        color={params.value ? 'success' : 'default'}
        variant="outlined"
      />
    ),
  },
  {
    field: 'graded',
    headerName: 'Graded',
    width: 90,
    valueFormatter: (value) =>
      value === null || value === undefined ? '—' : value ? 'Yes' : 'No',
  },
  {
    field: 'pageViews',
    headerName: 'Page views',
    width: 110,
    type: 'number',
    align: 'center',
    headerAlign: 'center',
    valueFormatter: (value) => formatCount(value ?? 0),
  },
  {
    field: 'participations',
    headerName: 'Submissions',
    width: 120,
    type: 'number',
    align: 'center',
    headerAlign: 'center',
    valueFormatter: (value) => formatCount(value),
  },
  {
    field: 'students',
    headerName: 'Students',
    width: 100,
    type: 'number',
    align: 'center',
    headerAlign: 'center',
    valueFormatter: (value) => formatCount(value),
  },
];

function indicesToIso(
  semesterStartIso: string,
  startIdx: number,
  endIdx: number,
): { start: string; end: string } {
  const semesterStart = parseIsoDateLocal(semesterStartIso);
  if (!semesterStart) {
    return { start: semesterStartIso, end: semesterStartIso };
  }
  const start = dateFromDayIndex(semesterStart, startIdx);
  const end = dateFromDayIndex(semesterStart, endIdx);
  return { start: toIsoDateUtc(start), end: toIsoDateUtc(end) };
}

const Engagement = () => {
  const { courseId } = useCourse();
  const { data, loading, error, fetchedAt } = useCourseData<CourseEngagementPayload>('engagement');
  const { capabilities } = useCourseCapabilities();

  const [dailyActivity, setDailyActivity] = useState<DailyActivityPoint[]>([]);
  const [content, setContent] = useState<CourseContentRow[]>([]);
  const [timeOfDay, setTimeOfDay] = useState<TimeOfDayPattern | null>(null);
  const [maxDayIndex, setMaxDayIndex] = useState(0);
  const [semesterStartIso, setSemesterStartIso] = useState('');
  const [startIdx, setStartIdx] = useState(0);
  const [endIdx, setEndIdx] = useState(0);
  const [contentLoading, setContentLoading] = useState(false);

  useEffect(() => {
    if (!data) return;
    if (data.dailyActivity.length > 0) {
      setDailyActivity(data.dailyActivity);
    }
    setContent(data.content);
    setTimeOfDay(data.timeOfDay);

    const semStart = parseIsoDateLocal(data.range.semesterStart);
    const selectedStart = parseIsoDateLocal(data.range.selectedStart);
    const selectedEnd = parseIsoDateLocal(data.range.selectedEnd);
    const sliderMax = parseIsoDateLocal(data.range.sliderMax);

    if (semStart && selectedStart && selectedEnd && sliderMax) {
      setSemesterStartIso(data.range.semesterStart);
      const maxIdx = Math.max(0, dayIndexFromSemesterStart(semStart, sliderMax));
      setMaxDayIndex(maxIdx);
      setStartIdx(Math.max(0, dayIndexFromSemesterStart(semStart, selectedStart)));
      setEndIdx(Math.max(0, dayIndexFromSemesterStart(semStart, selectedEnd)));
    }
  }, [data]);

  const { start: selectedStartIso, end: selectedEndIso } = useMemo(
    () => indicesToIso(semesterStartIso, startIdx, endIdx),
    [semesterStartIso, startIdx, endIdx],
  );

  const dailyPattern = useMemo(() => {
    const semStart = parseIsoDateLocal(semesterStartIso);
    if (!semStart) return data?.dailyPattern ?? null;
    const start = dateFromDayIndex(semStart, startIdx);
    const end = dateFromDayIndex(semStart, endIdx);
    const filtered = filterDailyToWindow(dailyActivity, start, end);
    if (filtered.length === 0 && dailyActivity.length === 0) {
      return data?.dailyPattern ?? null;
    }
    return analyzeDailyAccess(
      filtered.map((row) => ({ date: row.date, views: row.views })),
      start,
      end,
    );
  }, [dailyActivity, semesterStartIso, startIdx, endIdx, data?.dailyPattern]);

  const chartBundle = useMemo(() => {
    const semStart = parseIsoDateLocal(semesterStartIso);
    if (!semStart || dailyActivity.length === 0) {
      return data?.chart ?? { labels: [], pageViews: [], participations: [], note: '' };
    }
    const start = dateFromDayIndex(semStart, startIdx);
    const end = dateFromDayIndex(semStart, endIdx);
    const filtered = filterDailyToWindow(dailyActivity, start, end);
    const weekly = aggregateDailyToWeekly(filtered, start, end);
    return {
      ...weekly,
      note: data?.chart.note ?? '',
    };
  }, [dailyActivity, semesterStartIso, startIdx, endIdx, data?.chart.note]);

  const fetchContentForRange = useCallback(async () => {
    if (!courseId || !semesterStartIso) return;
    const { start, end } = indicesToIso(semesterStartIso, startIdx, endIdx);
    setContentLoading(true);
    try {
      const res = await fetch(
        `/api/courses/${courseId}/engagement?start=${start}&end=${end}&contentOnly=1`,
      );
      const body = (await res.json()) as CourseEngagementPayload;
      if (res.ok) {
        setContent(body.content);
        if (body.timeOfDay) setTimeOfDay(body.timeOfDay);
      }
    } finally {
      setContentLoading(false);
    }
  }, [courseId, semesterStartIso, startIdx, endIdx]);

  const rangeChangedFromDefault =
    !!data &&
    (selectedStartIso !== data.range.selectedStart ||
      selectedEndIso !== data.range.selectedEnd);

  useEffect(() => {
    if (!semesterStartIso || !rangeChangedFromDefault) return;
    const timer = window.setTimeout(() => {
      fetchContentForRange();
    }, 450);
    return () => window.clearTimeout(timer);
  }, [selectedStartIso, selectedEndIso, fetchContentForRange, semesterStartIso, rangeChangedFromDefault]);

  const handleStartSlider = (_: Event, value: number | number[]) => {
    const next = value as number;
    setStartIdx(next);
    if (next > endIdx) setEndIdx(next);
  };

  const handleEndSlider = (_: Event, value: number | number[]) => {
    const next = value as number;
    setEndIdx(next);
    if (next < startIdx) setStartIdx(next);
  };

  if (loading || error) {
    return <TabLoader loading={loading} error={error} />;
  }

  if (!data) return null;

  const hasChartData = chartBundle.labels.length > 0;

  const weeklyActivityData = {
    labels: chartBundle.labels,
    datasets: [
      {
        label: 'Page Views',
        data: chartBundle.pageViews,
        fill: false,
        borderColor: 'rgb(75, 192, 192)',
        tension: 0.1,
        yAxisID: 'y',
      },
      {
        label: 'Participations',
        data: chartBundle.participations,
        fill: false,
        borderColor: 'rgb(255, 99, 132)',
        tension: 0.1,
        yAxisID: 'y1',
      },
    ],
  };

  const chartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    interaction: { mode: 'index' as const, intersect: false },
    plugins: {
      legend: { position: 'top' as const },
      title: { display: true, text: 'Weekly course activity' },
    },
    scales: {
      y: {
        type: 'linear' as const,
        display: true,
        position: 'left' as const,
        title: { display: true, text: 'Page Views' },
      },
      y1: {
        type: 'linear' as const,
        display: true,
        position: 'right' as const,
        grid: { drawOnChartArea: false },
        title: { display: true, text: 'Participations' },
      },
    },
  };

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3, height: '100%' }}>
      <Alert severity={hasChartData ? 'info' : 'warning'}>
        {data.chart.note}
      </Alert>

      <Box sx={{ px: 1 }}>
        <Typography variant="subtitle2" gutterBottom>
          Time period: {formatRangeLabel(selectedStartIso)} – {formatRangeLabel(selectedEndIso)}
        </Typography>
        <Stack spacing={2} sx={{ maxWidth: 720 }}>
          <Box>
            <Typography variant="caption" color="text.secondary">
              Start date
            </Typography>
            <Slider
              value={startIdx}
              min={0}
              max={maxDayIndex}
              step={1}
              valueLabelDisplay="auto"
              valueLabelFormat={(v) => formatRangeLabel(indicesToIso(semesterStartIso, v, v).start)}
              onChange={handleStartSlider}
            />
          </Box>
          <Box>
            <Typography variant="caption" color="text.secondary">
              End date
            </Typography>
            <Slider
              value={endIdx}
              min={0}
              max={maxDayIndex}
              step={1}
              valueLabelDisplay="auto"
              valueLabelFormat={(v) => formatRangeLabel(indicesToIso(semesterStartIso, v, v).end)}
              onChange={handleEndSlider}
            />
          </Box>
        </Stack>
      </Box>

      {hasChartData ? (
        <Box sx={{ height: 300 }}>
          <Line options={chartOptions} data={weeklyActivityData} />
        </Box>
      ) : (
        <Typography color="text.secondary" sx={{ py: 4, textAlign: 'center' }}>
          No activity data for this period.
        </Typography>
      )}

      {dailyPattern ? (
        <ActivityPatternPanel
          daily={dailyPattern}
          timeOfDay={timeOfDay}
          timeOfDayLoading={contentLoading}
        />
      ) : null}

      <Box sx={{ width: '100%' }}>
        <Typography variant="h6" gutterBottom>
          Course content
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
          Page views use dated page-view logs when your token has Statistics permission; otherwise
          they count Canvas Analytics participation URLs in the range (strongest for assignments/LTI).
          Submissions use assignment <code>submitted_at</code> in the same range.
        </Typography>
        <Box sx={{ height: Math.max(280, Math.min(560, 56 + content.length * 52)) }}>
          <DataGrid
            rows={content}
            columns={contentColumns}
            loading={contentLoading}
            disableRowSelectionOnClick
            pageSizeOptions={[25, 50, 100]}
            initialState={{
              pagination: { paginationModel: { pageSize: 25 } },
            }}
            density="compact"
          />
        </Box>
      </Box>
      <TabDataSourceFooter
        sources={data.dataSources}
        fetchedAt={fetchedAt}
        note={capabilities?.tabNotes.engagement}
      />
    </Box>
  );
};

export default Engagement;
