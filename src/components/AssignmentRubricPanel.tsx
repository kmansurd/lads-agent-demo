'use client';

import React from 'react';
import {
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
import type { GradebookRating } from '@/lib/canvas/grades';

function points(value: number | null, possible: number | null): string {
  if (value == null) return '—';
  const shown = Number.isInteger(value) ? String(value) : value.toFixed(1);
  if (possible == null) return shown;
  const possibleShown = Number.isInteger(possible) ? String(possible) : possible.toFixed(1);
  return `${shown} / ${possibleShown}`;
}

function formatOrderedRatingCounts(
  ratingOrder: GradebookRating[],
  countsByKey: Record<string, number>,
): string {
  if (ratingOrder.length === 0) return '—';
  return ratingOrder
    .map((rating) => `${rating.label} (${countsByKey[rating.key] ?? 0})`)
    .join('; ');
}

export function AssignmentRubricPanel({
  detail,
  loading,
  ratingOrder,
}: {
  detail: AssignmentRubricDetail | null;
  loading: boolean;
  ratingOrder: GradebookRating[];
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
          This assignment has no rubric.
        </Typography>
      </Paper>
    );
  }

  return (
    <Paper variant="outlined" sx={{ p: 2, mt: 2 }}>
      <Typography variant="h6">Rubric</Typography>
      {ratingOrder.length === 0 ? (
        <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
          Match rubric ratings above to list every rating here, including zeros.
        </Typography>
      ) : null}

      {detail.criteria.length === 0 ? (
        <Typography variant="body2" sx={{ mt: 1.5 }}>
          No rubric criteria found for this assignment.
        </Typography>
      ) : (
        <TableContainer sx={{ mt: 1.5 }}>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Criterion</TableCell>
                <TableCell align="right">Average</TableCell>
                <TableCell>Ratings</TableCell>
                <TableCell align="right">Total</TableCell>
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
                  <TableCell sx={{ maxWidth: 520, whiteSpace: 'normal', lineHeight: 1.5 }}>
                    {formatOrderedRatingCounts(ratingOrder, criterion.ratingCountsByKey)}
                  </TableCell>
                  <TableCell align="right">{criterion.totalRatingCount}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      )}
      {detail.criteria.length > 0 && detail.rubricCount === 0 ? (
        <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
          No criterion marks have been posted yet. Counts below are zero.
        </Typography>
      ) : null}
    </Paper>
  );
}
