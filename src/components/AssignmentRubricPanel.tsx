'use client';

import React from 'react';
import {
  Box,
  CircularProgress,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Typography,
} from '@mui/material';
import type { AssignmentRubricDetail } from '@/lib/canvas/assignmentRubric';

function points(value: number | null, possible: number | null): string {
  if (value == null) return '—';
  const shown = Number.isInteger(value) ? String(value) : value.toFixed(1);
  if (possible == null) return shown;
  const possibleShown = Number.isInteger(possible) ? String(possible) : possible.toFixed(1);
  return `${shown} / ${possibleShown}`;
}

export function AssignmentRubricPanel({
  detail,
  loading,
}: {
  detail: AssignmentRubricDetail | null;
  loading: boolean;
}) {
  if (loading && !detail) {
    return (
      <Paper variant="outlined" sx={{ p: 2, mt: 2, display: 'flex', gap: 1.5, alignItems: 'center' }}>
        <CircularProgress size={18} />
        <Typography variant="body2">Loading rubric marks…</Typography>
      </Paper>
    );
  }

  if (!detail) return null;

  if (!detail.hasRubric) {
    return (
      <Paper variant="outlined" sx={{ p: 2, mt: 2 }}>
        <Typography variant="body2" color="text.secondary">
          This assignment has no rubric. The chart uses the posted score.
        </Typography>
      </Paper>
    );
  }

  const bothScored = detail.postedCount > 0 && detail.rubricCount > 0;

  return (
    <Paper variant="outlined" sx={{ p: 2, mt: 2 }}>
      <Typography variant="h6">Rubric</Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5, maxWidth: 760 }}>
        Posted score is the grade on the submission. Rubric total is the sum of the criterion marks. They can differ
        when the final grade is adjusted after the rubric is filled in.
        {detail.source === 'quiz' ? ' Criterion marks were read from the quiz rubric.' : ''}
      </Typography>

      <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 3, mt: 2 }}>
        <Box>
          <Typography variant="overline" color="text.secondary">
            Posted score
          </Typography>
          <Typography variant="h6">{points(detail.postedAverage, detail.pointsPossible)}</Typography>
          <Typography variant="caption" color="text.secondary">
            Average across {detail.postedCount} {detail.postedCount === 1 ? 'student' : 'students'}
          </Typography>
        </Box>
        <Box>
          <Typography variant="overline" color="text.secondary">
            Rubric total
          </Typography>
          <Typography variant="h6">{points(detail.rubricAverage, detail.rubricPointsPossible)}</Typography>
          <Typography variant="caption" color="text.secondary">
            Average across {detail.rubricCount} {detail.rubricCount === 1 ? 'student' : 'students'}
          </Typography>
        </Box>
      </Box>
      {bothScored ? (
        <Typography variant="body2" sx={{ mt: 1.5 }}>
          {detail.scoresDiffer > 0
            ? `${detail.scoresDiffer} ${detail.scoresDiffer === 1 ? 'student has' : 'students have'} a posted percentage that differs from the rubric percentage.`
            : 'Posted percentages match the rubric percentages.'}
        </Typography>
      ) : null}
      {detail.markers.length > 0 ? (
        <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
          Marked by{' '}
          {detail.markers
            .map((marker) => `${marker.name} (${marker.role}, ${marker.count})`)
            .join(' · ')}
        </Typography>
      ) : null}

      {detail.criteria.length > 0 && detail.rubricCount === 0 ? (
        <Typography variant="body2" sx={{ mt: 2 }}>
          The rubric is attached, and no criterion marks have been posted yet.
        </Typography>
      ) : (
        <TableContainer sx={{ mt: 2 }}>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Criterion</TableCell>
                <TableCell align="right">Average</TableCell>
                <TableCell>Ratings</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {detail.criteria.map((criterion) => (
                <TableRow key={criterion.id}>
                  <TableCell>
                    {criterion.description}
                    {criterion.ignoreForScoring ? ' (not scored)' : ''}
                  </TableCell>
                  <TableCell align="right">
                    {points(criterion.averagePoints, criterion.pointsPossible)}
                  </TableCell>
                  <TableCell>
                    {criterion.ratings.length > 0
                      ? criterion.ratings.map((rating) => `${rating.label} ${rating.count}`).join(' · ')
                      : '—'}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      )}
    </Paper>
  );
}
