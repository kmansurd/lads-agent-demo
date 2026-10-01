'use client';
import React, { useEffect, useMemo, useState } from 'react';
import { Bar } from 'react-chartjs-2';
import { Chart as ChartJS, CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend } from 'chart.js';
import {
  Box,
  Typography,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  Alert,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Button,
} from '@mui/material';
import { useCourseData } from '@/hooks/useCourseData';
import { TabLoader } from '@/components/CourseDataState';
import type { CourseGradesPayload, AssessmentGradeRow } from '@/lib/canvas/grades';
import { gradeCountsForChart, partitionAssessments } from '@/lib/canvas/assessmentDisplay';

ChartJS.register(CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend);

const OVERALL_CHART_VALUE = 'overall';

function AssessmentTableRows({ rows }: { rows: AssessmentGradeRow[] }) {
  return (
    <>
      {rows.map((assessment) => (
        <TableRow key={assessment.id}>
          <TableCell component="th" scope="row">
            {assessment.name}
            {assessment.usesRubric ? (
              <Typography component="span" variant="caption" color="text.secondary" sx={{ ml: 1 }}>
                (rubric)
              </Typography>
            ) : null}
          </TableCell>
          <TableCell align="right">{assessment.weighting}</TableCell>
          <TableCell align="right">{assessment.grades.A}</TableCell>
          <TableCell align="right">{assessment.grades.B}</TableCell>
          <TableCell align="right">{assessment.grades.C}</TableCell>
          <TableCell align="right">{assessment.grades.D}</TableCell>
          <TableCell align="right">{assessment.grades.F}</TableCell>
          <TableCell align="right">{assessment.notGraded}</TableCell>
        </TableRow>
      ))}
    </>
  );
}

const AssessmentTable = ({
  featured,
  other,
}: {
  featured: AssessmentGradeRow[];
  other: AssessmentGradeRow[];
}) => {
  const [showMore, setShowMore] = useState(false);
  const hiddenCount = other.length;

  return (
    <Box sx={{ mt: 4 }}>
      <Typography variant="h6" gutterBottom>
        Assessments
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        Rubric assignments with a clear % weight are listed first. Only students with a clear grade
        on that assignment are counted in A–F; others appear under Not graded.
      </Typography>
      {featured.length === 0 && hiddenCount === 0 ? (
        <Typography color="text.secondary">No published assignments.</Typography>
      ) : (
        <>
          <TableContainer component={Paper}>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>Assessment</TableCell>
                  <TableCell align="right">Weighting</TableCell>
                  <TableCell align="right">A</TableCell>
                  <TableCell align="right">B</TableCell>
                  <TableCell align="right">C</TableCell>
                  <TableCell align="right">D</TableCell>
                  <TableCell align="right">F</TableCell>
                  <TableCell align="right">Not graded</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {featured.length > 0 ? (
                  <AssessmentTableRows rows={featured} />
                ) : (
                  <TableRow>
                    <TableCell colSpan={8}>
                      <Typography variant="body2" color="text.secondary">
                        No rubric assignments with clear weighting — use View more to see all
                        assessments.
                      </Typography>
                    </TableCell>
                  </TableRow>
                )}
                {showMore && hiddenCount > 0 && <AssessmentTableRows rows={other} />}
              </TableBody>
            </Table>
          </TableContainer>
          {hiddenCount > 0 && (
            <Box sx={{ mt: 1, display: 'flex', justifyContent: 'flex-end' }}>
              <Button size="small" onClick={() => setShowMore((v) => !v)}>
                {showMore ? 'Show fewer' : `View more (${hiddenCount})`}
              </Button>
            </Box>
          )}
        </>
      )}
    </Box>
  );
};

const CourseGrade = () => {
  const { data, loading, error } = useCourseData<CourseGradesPayload>('grades');
  const [chartSelection, setChartSelection] = useState<string>(OVERALL_CHART_VALUE);

  const { featured, other } = useMemo(
    () => partitionAssessments(data?.assessments ?? []),
    [data?.assessments],
  );

  useEffect(() => {
    if (chartSelection === OVERALL_CHART_VALUE) return;
    if (!featured.some((a) => String(a.id) === chartSelection)) {
      setChartSelection(OVERALL_CHART_VALUE);
    }
  }, [featured, chartSelection]);

  const selectedAssessment = useMemo(
    () => featured.find((a) => String(a.id) === chartSelection),
    [featured, chartSelection],
  );

  const chartTitle =
    chartSelection === OVERALL_CHART_VALUE
      ? 'Grade distribution — Overall (Canvas gradebook current grade)'
      : `Grade distribution — ${selectedAssessment?.name ?? 'Assessment'}`;

  const chartCounts =
    chartSelection === OVERALL_CHART_VALUE
      ? data?.distribution.counts ?? []
      : selectedAssessment
        ? gradeCountsForChart(selectedAssessment)
        : [];

  const chartOptions = {
    responsive: true,
    plugins: {
      legend: { position: 'top' as const },
      title: { display: true, text: chartTitle },
    },
  };

  if (loading || error) {
    return <TabLoader loading={loading} error={error} />;
  }

  if (!data) return null;

  const chartData = {
    labels: data.distribution.labels,
    datasets: [
      {
        label: 'Students',
        data: chartCounts,
        backgroundColor: 'rgba(75, 192, 192, 0.6)',
      },
    ],
  };

  return (
    <Box>
      <Alert severity="info" sx={{ mb: 2 }}>
        {chartSelection === OVERALL_CHART_VALUE ? (
          <>
            Overall chart uses each student&apos;s <strong>current grade</strong> from the Canvas
            gradebook ({data.distribution.studentsWithGrade} students with a score).
          </>
        ) : (
          <>
            Assignment chart counts only students with a <strong>clear grade</strong> on this item
            (rubric or posted score). {selectedAssessment?.notGraded ?? 0} not graded on this
            assignment.
          </>
        )}
      </Alert>

      <FormControl size="small" sx={{ minWidth: 280, mb: 2 }}>
        <InputLabel id="grade-chart-assessment-label">Show distribution for</InputLabel>
        <Select
          labelId="grade-chart-assessment-label"
          value={chartSelection}
          label="Show distribution for"
          onChange={(e) => setChartSelection(e.target.value)}
        >
          <MenuItem value={OVERALL_CHART_VALUE}>Overall</MenuItem>
          {featured.map((a) => (
            <MenuItem key={a.id} value={String(a.id)}>
              {a.name}
            </MenuItem>
          ))}
        </Select>
      </FormControl>

      <Bar options={chartOptions} data={chartData} />
      <Typography variant="caption" display="block" color="text.secondary" sx={{ mt: 1 }}>
        {data.weightingNote}
      </Typography>
      <AssessmentTable featured={featured} other={other} />
    </Box>
  );
};

export default CourseGrade;
