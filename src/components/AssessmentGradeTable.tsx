'use client';

import React from 'react';
import {
  Box,
  Button,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Typography,
} from '@mui/material';
import type { AssessmentGradeRow, GradebookCriterion } from '@/lib/canvas/grades';
import {
  LETTERS,
  letterColumnCounts,
  percentColumnCounts,
  ratingCount,
  type GradeScale,
  type PercentRange,
  type RatingMatchMap,
} from '@/lib/canvas/rubricMapping';

function csvCell(value: string | number): string {
  const text = String(value);
  if (/[",\n\r]/.test(text)) return `"${text.replace(/"/g, '""')}"`;
  return text;
}

function downloadGradebookCsv(
  rows: AssessmentGradeRow[],
  scale: GradeScale,
  matches: RatingMatchMap,
  criteria: GradebookCriterion[],
  ranges: PercentRange[],
) {
  const ratingColumns = criteria.flatMap((criterion) =>
    criterion.ratings.map((rating) => ({ criterion, rating })),
  );
  const gradeLabels = scale === 'letter' ? [...LETTERS] : ranges.map((range) => range.label);
  const lead = ['Assessment', 'Weighting', ...gradeLabels, 'Not graded', 'Submitted', 'Late', 'Missing', 'Excused'];
  const header = [...lead, ...ratingColumns.map(({ criterion }) => criterion.description)];
  const ratingHeader = [
    ...lead.map(() => ''),
    ...ratingColumns.map(({ rating }) => rating.label),
  ];

  const body = rows.map((assessment) => {
    const graded =
      scale === 'letter'
        ? letterColumnCounts(assessment, matches)
        : percentColumnCounts(assessment, matches, ranges);
    const rubricCells = ratingColumns.map(({ criterion, rating }) => {
      const count = ratingCount(assessment, criterion.key, rating.key);
      return count == null ? '' : count;
    });
    return [
      assessment.usesRubric ? `${assessment.name} (rubric)` : assessment.name,
      assessment.weighting,
      ...graded.counts,
      graded.notGraded,
      assessment.submissionStatus.submitted,
      assessment.submissionStatus.late,
      assessment.submissionStatus.missing,
      assessment.submissionStatus.excused,
      ...rubricCells,
    ];
  });

  const csv = [header, ratingHeader, ...body]
    .map((line) => line.map((cell) => csvCell(cell)).join(','))
    .join('\r\n');
  const blob = new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = scale === 'letter' ? 'gradebook-letters.csv' : 'gradebook-percentages.csv';
  link.click();
  URL.revokeObjectURL(url);
}

export function AssessmentGradeTable({
  rows,
  scale,
  matches,
  criteria,
  ranges,
}: {
  rows: AssessmentGradeRow[];
  scale: GradeScale;
  matches: RatingMatchMap;
  criteria: GradebookCriterion[];
  ranges: PercentRange[];
}) {
  const gradeLabels = scale === 'letter' ? LETTERS : ranges.map((range) => range.label);

  return (
    <Box sx={{ mt: 4, minWidth: 0, maxWidth: '100%' }}>
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 2, mb: 1 }}>
        <Typography variant="h6">Assessments</Typography>
        <Button
          size="small"
          variant="outlined"
          disabled={rows.length === 0}
          onClick={() => downloadGradebookCsv(rows, scale, matches, criteria, ranges)}
        >
          Download CSV
        </Button>
      </Box>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        {scale === 'letter'
          ? 'Letter columns count students. After you match a rating, rubric assignments use that match. A student with several ratings is counted under the points-weighted letter.'
          : 'Percentage columns are the ranges you set. Each student is counted once, using a points-weighted midpoint of the matched ratings. Assignments without a rubric use the posted score.'}{' '}
        The CSV also includes how many times each rubric rating was used. Roll Call Attendance is left out.
      </Typography>
      {rows.length === 0 ? (
        <Typography color="text.secondary">No published assignments.</Typography>
      ) : (
        <TableContainer component={Paper} sx={{ width: '100%', overflowX: 'auto' }}>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Assessment</TableCell>
                <TableCell align="right">Weighting</TableCell>
                {gradeLabels.map((label) => (
                  <TableCell key={label} align="right">
                    {label}
                  </TableCell>
                ))}
                <TableCell align="right">Not graded</TableCell>
                <TableCell align="right">Submitted</TableCell>
                <TableCell align="right">Late</TableCell>
                <TableCell align="right">Missing</TableCell>
                <TableCell align="right">Excused</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {rows.map((assessment) => {
                const graded =
                  scale === 'letter'
                    ? letterColumnCounts(assessment, matches)
                    : percentColumnCounts(assessment, matches, ranges);
                return (
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
                    {graded.counts.map((count, index) => (
                      <TableCell key={gradeLabels[index] ?? index} align="right">
                        {count}
                      </TableCell>
                    ))}
                    <TableCell align="right">{graded.notGraded}</TableCell>
                    <TableCell align="right">{assessment.submissionStatus.submitted}</TableCell>
                    <TableCell align="right">{assessment.submissionStatus.late}</TableCell>
                    <TableCell align="right">{assessment.submissionStatus.missing}</TableCell>
                    <TableCell align="right">{assessment.submissionStatus.excused}</TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </TableContainer>
      )}
    </Box>
  );
}
