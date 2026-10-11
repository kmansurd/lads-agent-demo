'use client';

import React, { useState } from 'react';
import {
  Box,
  Button,
  MenuItem,
  Paper,
  Select,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
  Typography,
} from '@mui/material';
import type { GradebookRating } from '@/lib/canvas/grades';
import type { LetterBucket } from '@/lib/canvas/letterScale';
import {
  LETTERS,
  emptyMatch,
  parseRange,
  type GradeScale,
  type RatingMatchMap,
} from '@/lib/canvas/rubricMapping';

export function RubricRatingMap({
  ratings,
  scale,
  matches,
  onScale,
  onMatch,
  onRemove,
  onAdd,
}: {
  ratings: GradebookRating[];
  scale: GradeScale;
  matches: RatingMatchMap;
  onScale: (scale: GradeScale) => void;
  onMatch: (ratingKey: string, patch: Partial<RatingMatchMap[string]>) => void;
  onRemove: (ratingKey: string) => void;
  onAdd: (label: string) => void;
}) {
  const [draft, setDraft] = useState('');

  const addDraft = () => {
    const label = draft.replace(/\s+/g, ' ').trim();
    if (!label) return;
    onAdd(label);
    setDraft('');
  };

  return (
    <Paper variant="outlined" sx={{ p: 2, mb: 2, maxWidth: '100%', overflowX: 'auto' }}>
      <Typography variant="h6">Match rubric ratings</Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5, maxWidth: 760 }}>
        Ratings are the same on every criterion. Match each one to a letter grade or a percentage
        range, or remove it from this list. You can also add a rating. Only ratings on published
        assignments are listed at first. For a percentage, set the start and end yourself, from 0 to
        100.
      </Typography>
      <ToggleButtonGroup
        exclusive
        size="small"
        value={scale}
        onChange={(_, value: GradeScale | null) => {
          if (value) onScale(value);
        }}
        sx={{ mt: 1.5 }}
      >
        <ToggleButton value="letter">Letter grades</ToggleButton>
        <ToggleButton value="percent">Percentage ranges</ToggleButton>
      </ToggleButtonGroup>

      {ratings.length === 0 ? (
        <Typography variant="body2" color="text.secondary" sx={{ mt: 2 }}>
          No ratings in this list. Add one below, or published assignments in this course have none yet.
        </Typography>
      ) : (
        <Table size="small" sx={{ mt: 2, maxWidth: 640 }}>
          <TableHead>
            <TableRow>
              <TableCell>Rating</TableCell>
              <TableCell>{scale === 'letter' ? 'Letter grade' : 'Percentage range'}</TableCell>
              <TableCell />
            </TableRow>
          </TableHead>
          <TableBody>
            {ratings.map((rating) => {
              const match = matches[rating.key] ?? emptyMatch();
              const rangeInvalid =
                scale === 'percent' &&
                (match.start.trim() !== '' || match.end.trim() !== '') &&
                parseRange(match) == null;
              return (
                <TableRow key={rating.key}>
                  <TableCell>{rating.label}</TableCell>
                  <TableCell>
                    {scale === 'letter' ? (
                      <Select
                        size="small"
                        displayEmpty
                        value={match.letter}
                        onChange={(event) =>
                          onMatch(rating.key, { letter: event.target.value as LetterBucket | '' })
                        }
                        sx={{ minWidth: 120 }}
                      >
                        <MenuItem value="">Choose</MenuItem>
                        {LETTERS.map((letter) => (
                          <MenuItem key={letter} value={letter}>
                            {letter}
                          </MenuItem>
                        ))}
                      </Select>
                    ) : (
                      <Box>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                          <TextField
                            size="small"
                            type="number"
                            label="From"
                            value={match.start}
                            onChange={(event) => onMatch(rating.key, { start: event.target.value })}
                            slotProps={{ htmlInput: { min: 0, max: 100, step: 1 } }}
                            sx={{ width: 100 }}
                          />
                          <TextField
                            size="small"
                            type="number"
                            label="To"
                            value={match.end}
                            onChange={(event) => onMatch(rating.key, { end: event.target.value })}
                            slotProps={{ htmlInput: { min: 0, max: 100, step: 1 } }}
                            sx={{ width: 100 }}
                          />
                        </Box>
                        {rangeInvalid ? (
                          <Typography variant="caption" color="error">
                            Use a start and end from 0 to 100, with the start first.
                          </Typography>
                        ) : null}
                      </Box>
                    )}
                  </TableCell>
                  <TableCell align="right">
                    <Button size="small" color="inherit" onClick={() => onRemove(rating.key)} aria-label={`Remove ${rating.label}`}>
                      Remove
                    </Button>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      )}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mt: 2, maxWidth: 640 }}>
        <TextField
          size="small"
          label="New rating"
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault();
              addDraft();
            }
          }}
          sx={{ flex: 1 }}
        />
        <Button variant="outlined" size="small" onClick={addDraft} disabled={draft.trim() === ''}>
          Add
        </Button>
      </Box>
    </Paper>
  );
}
