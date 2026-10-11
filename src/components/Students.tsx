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
import { DataGrid, GridColDef, type GridRowSelectionModel } from '@mui/x-data-grid';
import { Box, Button, Slider, Stack, Typography } from '@mui/material';
import { useCourse } from '@/context/CourseContext';
import { useCourseData } from '@/hooks/useCourseData';
import { TabLoader } from '@/components/CourseDataState';
import { TabDataSourceFooter } from '@/components/TabDataSourceFooter';
import { useCourseCapabilities } from '@/hooks/useCourseCapabilities';
import type { CourseStudentsPayload, StudentRow } from '@/lib/canvas/students';
import type { EngagementRangeMeta } from '@/lib/canvas/engagementRange';
import {
  dateFromDayIndex,
  dayIndexFromSemesterStart,
  formatRangeLabel,
  parseIsoDateLocal,
} from '@/lib/canvas/engagementRange';
import { toIsoDateUtc } from '@/lib/canvas/courseTimeline';
import { weekLabelsForRange } from '@/lib/canvas/activityPatterns';

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Title, Tooltip, Legend);

const formatCount = (value: unknown) =>
  value == null || value === '' ? '—' : Number(value).toLocaleString();

const columns: GridColDef[] = [
  { field: 'id', headerName: 'ID', width: 90 },
  { field: 'name', headerName: 'Name', width: 180 },
  { field: 'grade', headerName: 'Grade', type: 'number', width: 110 },
  {
    field: 'pagesViewedInRange',
    headerName: 'Page views (period)',
    type: 'number',
    width: 160,
    description: 'Hourly Canvas Analytics page views in the selected date range',
    valueFormatter: (value) => formatCount(value),
  },
  {
    field: 'pagesViewedCourse',
    headerName: 'Page views (course)',
    type: 'number',
    width: 160,
    description: 'Lifetime course page views from student summaries',
  },
  {
    field: 'participationsInRange',
    headerName: 'Participations (period)',
    type: 'number',
    width: 170,
    valueFormatter: (value) => formatCount(value),
  },
  {
    field: 'activeDays',
    headerName: 'Active days',
    type: 'number',
    width: 120,
    description: 'Days in the selected range with at least one hourly page view',
    valueFormatter: (value) => formatCount(value),
  },
  {
    field: 'avgDailyViews',
    headerName: 'Avg views/day',
    type: 'number',
    width: 130,
    valueFormatter: (value) => formatCount(value),
  },
  {
    field: 'quietDays',
    headerName: 'Quiet days',
    type: 'number',
    width: 120,
    description: 'Days in the selected range with no hourly page views',
    valueFormatter: (value) => formatCount(value),
  },
  {
    field: 'longestQuietDays',
    headerName: 'Longest quiet',
    type: 'number',
    width: 130,
    description: 'Longest run of days in range with no hourly page views',
    valueFormatter: (value) => formatCount(value),
  },
  {
    field: 'engagementRate',
    headerName: 'Active %',
    type: 'number',
    width: 110,
    description: 'Active days as a percent of days in the selected range',
    valueFormatter: (value) => (value == null || value === '' ? '—' : `${value}%`),
  },
  { field: 'participations', headerName: 'Participations (course)', type: 'number', width: 180 },
  {
    field: 'missingWorkLabel',
    headerName: 'Missing work',
    width: 130,
    description: 'From Canvas analytics/student_summaries tardiness',
  },
  {
    field: 'missingWorkPct',
    headerName: 'Missing %',
    type: 'number',
    width: 100,
    valueFormatter: (value) => (value == null ? '—' : `${value}%`),
  },
  { field: 'lastActivity', headerName: 'Last Activity', width: 160 },
];

type StudentsResponse = CourseStudentsPayload & { dataSources: string[] };

function studentLineColor(studentId: number): string {
  const hue = Math.round((studentId * 137.508) % 360);
  return `hsl(${hue} 68% 42%)`;
}

function idsFromSelection(model: GridRowSelectionModel, allIds: number[]): number[] {
  if (Array.isArray(model)) return model.map((id) => Number(id));
  const picked = [...model.ids].map((id) => Number(id));
  if (model.type === 'exclude') {
    const excluded = new Set(picked);
    return allIds.filter((id) => !excluded.has(id));
  }
  return picked;
}

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

function downloadCsv(students: StudentRow[], range: EngagementRangeMeta) {
  const header = [
    'student_id',
    'student_name',
    'page_views_in_range',
    'participations_in_range',
    'active_days',
    'avg_views_per_day',
    'quiet_days',
    'longest_quiet_days',
    'active_day_pct',
    'page_views_course',
    'participations_course',
  ];
  const lines = students.map((row) =>
    [
      row.id,
      `"${row.name.replaceAll('"', '""')}"`,
      row.pagesViewedInRange ?? '',
      row.participationsInRange ?? '',
      row.activeDays ?? '',
      row.avgDailyViews ?? '',
      row.quietDays ?? '',
      row.longestQuietDays ?? '',
      row.engagementRate ?? '',
      row.pagesViewedCourse,
      row.participations,
    ].join(','),
  );
  const blob = new Blob([[header.join(','), ...lines].join('\n')], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `page_views_${range.selectedStart}_${range.selectedEnd}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

const Students = () => {
  const { courseId } = useCourse();
  const { data, loading, error, fetchedAt } = useCourseData<StudentsResponse>('students');
  const { capabilities } = useCourseCapabilities();

  const [students, setStudents] = useState<StudentRow[]>([]);
  const [range, setRange] = useState<EngagementRangeMeta | null>(null);
  const [activityNote, setActivityNote] = useState('');
  const [maxDayIndex, setMaxDayIndex] = useState(0);
  const [semesterStartIso, setSemesterStartIso] = useState('');
  const [startIdx, setStartIdx] = useState(0);
  const [endIdx, setEndIdx] = useState(0);
  const [rangeLoading, setRangeLoading] = useState(false);
  const [selectedIds, setSelectedIds] = useState<number[]>([]);

  useEffect(() => {
    if (!data) return;
    setStudents(data.students);
    setRange(data.range);
    setActivityNote(data.activityNote);
    const semStart = parseIsoDateLocal(data.range.semesterStart);
    const selectedStart = parseIsoDateLocal(data.range.selectedStart);
    const selectedEnd = parseIsoDateLocal(data.range.selectedEnd);
    const sliderMax = parseIsoDateLocal(data.range.sliderMax);
    if (semStart && selectedStart && selectedEnd && sliderMax) {
      setSemesterStartIso(data.range.semesterStart);
      setMaxDayIndex(Math.max(0, dayIndexFromSemesterStart(semStart, sliderMax)));
      setStartIdx(Math.max(0, dayIndexFromSemesterStart(semStart, selectedStart)));
      setEndIdx(Math.max(0, dayIndexFromSemesterStart(semStart, selectedEnd)));
    }
  }, [data]);

  const { start: selectedStartIso, end: selectedEndIso } = useMemo(
    () => indicesToIso(semesterStartIso, startIdx, endIdx),
    [semesterStartIso, startIdx, endIdx],
  );

  const fetchForRange = useCallback(async () => {
    if (!courseId || !semesterStartIso) return;
    const { start, end } = indicesToIso(semesterStartIso, startIdx, endIdx);
    setRangeLoading(true);
    try {
      const res = await fetch(`/api/courses/${courseId}/students?start=${start}&end=${end}`);
      const body = (await res.json()) as StudentsResponse;
      if (res.ok) {
        setStudents(body.students);
        setRange(body.range);
        setActivityNote(body.activityNote);
      }
    } finally {
      setRangeLoading(false);
    }
  }, [courseId, semesterStartIso, startIdx, endIdx]);

  const rangeChanged =
    !!data &&
    (selectedStartIso !== data.range.selectedStart || selectedEndIso !== data.range.selectedEnd);

  useEffect(() => {
    if (!semesterStartIso || !rangeChanged) return;
    const timer = window.setTimeout(() => {
      fetchForRange();
    }, 450);
    return () => window.clearTimeout(timer);
  }, [selectedStartIso, selectedEndIso, fetchForRange, semesterStartIso, rangeChanged]);

  const compareChart = useMemo(() => {
    const selected = new Set(selectedIds);
    const plotted = students.filter(
      (row): row is StudentRow & { weeklyViews: number[] } =>
        selected.has(row.id) && Array.isArray(row.weeklyViews) && row.weeklyViews.length > 0,
    );
    if (plotted.length === 0) return null;
    const start = parseIsoDateLocal(selectedStartIso);
    const end = parseIsoDateLocal(selectedEndIso);
    if (!start || !end) return null;
    const labels = weekLabelsForRange(start, end);
    const length = Math.max(labels.length, ...plotted.map((row) => row.weeklyViews.length));
    const pad = (values: number[]) => Array.from({ length }, (_, index) => values[index] ?? 0);
    return {
      labels:
        labels.length === length
          ? labels
          : Array.from({ length }, (_, index) => `Week ${index + 1}`),
      datasets: plotted.map((row) => {
        const color = studentLineColor(row.id);
        return {
          label: row.name,
          data: pad(row.weeklyViews),
          borderColor: color,
          backgroundColor: color,
          borderWidth: 1.5,
          pointRadius: 0,
          pointHoverRadius: 3,
          tension: 0.15,
        };
      }),
    };
  }, [students, selectedIds, selectedStartIso, selectedEndIso]);

  if (loading || error) {
    return <TabLoader loading={loading} error={error} />;
  }

  if (!data) return null;

  return (
    <div style={{ height: 'auto', width: '100%' }}>
      <Box sx={{ px: 1, mb: 2 }}>
        <Stack direction="row" justifyContent="space-between" alignItems="center">
          <Typography variant="subtitle2">
            Time period: {formatRangeLabel(selectedStartIso)} – {formatRangeLabel(selectedEndIso)}
          </Typography>
          <Button
            size="small"
            variant="outlined"
            disabled={!range}
            onClick={() => range && downloadCsv(students, range)}
          >
            Download CSV
          </Button>
        </Stack>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
          {activityNote}
        </Typography>
        <Stack spacing={1} sx={{ maxWidth: 720 }}>
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
              onChange={(_, value) => {
                const next = value as number;
                setStartIdx(next);
                if (next > endIdx) setEndIdx(next);
              }}
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
              onChange={(_, value) => {
                const next = value as number;
                setEndIdx(next);
                if (next < startIdx) setStartIdx(next);
              }}
            />
          </Box>
        </Stack>
      </Box>
      <Box sx={{ px: 1, mb: 2 }}>
        <Typography variant="subtitle2" gutterBottom>
          Weekly page views by student
        </Typography>
        {selectedIds.length === 0 ? (
          <Typography variant="body2" color="text.secondary">
            Select students in the table to compare their weekly page views.
          </Typography>
        ) : compareChart ? (
          <Box>
            <Typography variant="caption" color="text.secondary">
              {compareChart.datasets.length.toLocaleString()} selected. Hover a line to see the name.
            </Typography>
            <Box sx={{ height: 360 }}>
              <Line
                data={compareChart}
                options={{
                  responsive: true,
                  maintainAspectRatio: false,
                  interaction: { mode: 'nearest', intersect: false },
                  plugins: {
                    legend: { display: false },
                    title: { display: false },
                    tooltip: {
                      callbacks: {
                        label: (item) =>
                          `${item.dataset.label ?? 'Student'}: ${Number(item.parsed.y).toLocaleString()}`,
                      },
                    },
                  },
                }}
              />
            </Box>
            <Box
              sx={{
                display: 'flex',
                flexWrap: 'wrap',
                gap: 0.75,
                maxHeight: 140,
                overflow: 'auto',
                mt: 1,
              }}
            >
              {compareChart.datasets.map((dataset, index) => (
                <Box
                  key={`${dataset.label}-${index}`}
                  sx={{ display: 'flex', alignItems: 'center', gap: 0.5, minWidth: 0 }}
                >
                  <Box
                    sx={{
                      width: 14,
                      height: 3,
                      bgcolor: String(dataset.borderColor),
                      flexShrink: 0,
                    }}
                  />
                  <Typography variant="caption" noWrap sx={{ maxWidth: 160 }}>
                    {dataset.label}
                  </Typography>
                </Box>
              ))}
            </Box>
          </Box>
        ) : (
          <Typography variant="body2" color="text.secondary">
            The selected students have no hourly page views in this range.
          </Typography>
        )}
      </Box>
      <DataGrid
        rows={students}
        columns={columns}
        loading={rangeLoading}
        autoHeight
        checkboxSelection
        onRowSelectionModelChange={(model: GridRowSelectionModel) => {
          setSelectedIds(idsFromSelection(model, students.map((row) => row.id)));
        }}
        initialState={{
          sorting: { sortModel: [{ field: 'name', sort: 'asc' }] },
        }}
      />
      <TabDataSourceFooter
        sources={data.dataSources}
        fetchedAt={fetchedAt}
        note={capabilities?.tabNotes.students}
      />
    </div>
  );
};

export default Students;
