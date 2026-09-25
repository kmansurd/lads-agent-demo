'use client';
import React from 'react';
import { Bar } from 'react-chartjs-2';
import { Chart as ChartJS, CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend } from 'chart.js';
import { Box, Typography, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Paper } from '@mui/material';
import { useCourseData } from '@/hooks/useCourseData';
import { TabLoader } from '@/components/CourseDataState';
import type { CourseGradesPayload, AssessmentGradeRow } from '@/lib/canvas/grades';

ChartJS.register(CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend);

const renderAssessmentTable = (assessments: AssessmentGradeRow[], title: string) => (
  <Box sx={{ mt: 4 }}>
    <Typography variant="h6" gutterBottom>{title}</Typography>
    {assessments.length === 0 ? (
      <Typography color="text.secondary">No assignments in this group.</Typography>
    ) : (
      <TableContainer component={Paper}>
        <Table>
          <TableHead>
            <TableRow>
              <TableCell>Assessment</TableCell>
              <TableCell align="right">Weighting</TableCell>
              <TableCell align="right">A</TableCell>
              <TableCell align="right">B</TableCell>
              <TableCell align="right">C</TableCell>
              <TableCell align="right">D</TableCell>
              <TableCell align="right">F</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {assessments.map((assessment) => (
              <TableRow key={assessment.name}>
                <TableCell component="th" scope="row">{assessment.name}</TableCell>
                <TableCell align="right">{assessment.weighting}</TableCell>
                <TableCell align="right">{assessment.grades.A}</TableCell>
                <TableCell align="right">{assessment.grades.B}</TableCell>
                <TableCell align="right">{assessment.grades.C}</TableCell>
                <TableCell align="right">{assessment.grades.D}</TableCell>
                <TableCell align="right">{assessment.grades.F}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>
    )}
  </Box>
);

const CourseGrade = () => {
  const { data, loading, error } = useCourseData<CourseGradesPayload>('grades');

  const options = {
    responsive: true,
    plugins: {
      legend: { position: 'top' as const },
      title: { display: true, text: 'Course Grade Distribution (current scores)' },
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
        label: 'Number of Students',
        data: data.distribution.counts,
        backgroundColor: 'rgba(75, 192, 192, 0.6)',
      },
    ],
  };

  return (
    <Box>
      <Bar options={options} data={chartData} />
      {renderAssessmentTable(data.formative, 'Formative Assessments')}
      {renderAssessmentTable(data.summative, 'Summative Assessments')}
    </Box>
  );
};

export default CourseGrade;
