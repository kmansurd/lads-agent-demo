'use client';

import React, { useEffect, useState } from 'react';
import { Box, Chip, Collapse, Paper, Skeleton, Typography } from '@mui/material';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import type { AnalyticsCapabilityLevel } from '@/lib/canvas/capabilities';
import { useCourseCapabilities } from '@/hooks/useCourseCapabilities';
import { useCourse } from '@/context/CourseContext';

function analyticsHeadline(level: AnalyticsCapabilityLevel): string {
  if (level === 'available') return 'Canvas analytics fully available';
  if (level === 'partial') return 'Canvas analytics partially available';
  return 'Canvas analytics unavailable';
}

export function CanvasCapabilitiesBanner() {
  const { courseId } = useCourse();
  const { capabilities, loading } = useCourseCapabilities();
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    setExpanded(false);
  }, [courseId]);

  if (loading) {
    return (
      <Box sx={{ px: { xs: 2, sm: 3 }, pt: 2 }}>
        <Skeleton variant="rounded" height={48} sx={{ borderRadius: 4 }} />
      </Box>
    );
  }

  if (!capabilities) {
    return null;
  }

  const { analytics, gradebook, discussions, checkedAt } = capabilities;
  const headline = analyticsHeadline(analytics.level);
  const checked = new Date(checkedAt);
  const checkedLabel = Number.isNaN(checked.getTime()) ? checkedAt : checked.toLocaleString();

  return (
    <Paper
      sx={{
        mx: { xs: 2, sm: 3 },
        mt: 2,
        mb: 0,
        p: { xs: 1.5, sm: 2 },
      }}
    >
      <Box
        component="button"
        type="button"
        onClick={() => setExpanded((open) => !open)}
        aria-expanded={expanded}
        sx={{
          display: 'flex',
          alignItems: 'center',
          width: '100%',
          gap: 0.5,
          p: 0,
          m: 0,
          border: 'none',
          background: 'none',
          cursor: 'pointer',
          textAlign: 'left',
          color: 'inherit',
          font: 'inherit',
          borderRadius: 1,
          transition: 'opacity 0.2s ease',
          '&:hover': { opacity: 0.85 },
          '&:focus-visible': {
            outline: '2px solid',
            outlineColor: 'primary.main',
            outlineOffset: 2,
          },
        }}
      >
        <Typography variant="subtitle2" sx={{ flex: 1 }}>
          {headline}
        </Typography>
        <ExpandMoreIcon
          fontSize="small"
          sx={{
            color: 'text.secondary',
            transform: expanded ? 'rotate(180deg)' : 'rotate(0deg)',
            transition: 'transform 0.25s ease',
          }}
        />
      </Box>
      <Collapse in={expanded} timeout="auto">
        <Box sx={{ pt: 1.5 }}>
          <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.75, mb: 1.5 }}>
            <Chip size="small" label={`Activity · ${analytics.activity}`} variant="outlined" />
            <Chip size="small" label={`Summaries · ${analytics.studentSummaries}`} variant="outlined" />
            <Chip size="small" label={`Assignments · ${analytics.assignmentAnalytics}`} variant="outlined" />
            <Chip
              size="small"
              label={`Page views · ${capabilities.permissions.viewStatistics ? 'ok' : 'forbidden'}`}
              variant="outlined"
            />
            <Chip size="small" label={`Gradebook · ${gradebook.level}`} variant="outlined" />
            <Chip size="small" label={`Discussions · ${discussions}`} variant="outlined" />
          </Box>
          <Typography variant="body2" color="text.secondary" sx={{ lineHeight: 1.5 }}>
            {capabilities.tabNotes.engagement} {capabilities.tabNotes.students}
          </Typography>
          <Typography variant="caption" display="block" color="text.secondary" sx={{ mt: 1 }}>
            Probed {checkedLabel}. Re-select the course to refresh.
          </Typography>
        </Box>
      </Collapse>
    </Paper>
  );
}
