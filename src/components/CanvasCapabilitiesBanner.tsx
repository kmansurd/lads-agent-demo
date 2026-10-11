'use client';

import React from 'react';
import { Alert, Box, Chip, Skeleton, Typography } from '@mui/material';
import type { AnalyticsCapabilityLevel } from '@/lib/canvas/capabilities';
import { useCourseCapabilities } from '@/hooks/useCourseCapabilities';

function analyticsSeverity(
  level: AnalyticsCapabilityLevel,
): 'success' | 'warning' | 'error' {
  if (level === 'available') return 'success';
  if (level === 'partial') return 'warning';
  return 'error';
}

function analyticsLabel(level: AnalyticsCapabilityLevel): string {
  if (level === 'available') return 'Canvas Analytics: fully available';
  if (level === 'partial') return 'Canvas Analytics: partial';
  return 'Canvas Analytics: unavailable';
}

export function CanvasCapabilitiesBanner() {
  const { capabilities, loading } = useCourseCapabilities();

  if (loading) {
    return (
      <Box sx={{ px: 2, pt: 1 }}>
        <Skeleton variant="rounded" height={56} />
      </Box>
    );
  }

  if (!capabilities) {
    return null;
  }

  const { analytics, gradebook, discussions, checkedAt } = capabilities;
  const checked = new Date(checkedAt);
  const checkedLabel = Number.isNaN(checked.getTime())
    ? checkedAt
    : checked.toLocaleString();

  return (
    <Alert severity={analyticsSeverity(analytics.level)} sx={{ mx: 2, mt: 1 }}>
      <Typography variant="subtitle2" gutterBottom>
        {analyticsLabel(analytics.level)}
      </Typography>
      <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.75, mb: 1 }}>
        <Chip size="small" label={`activity: ${analytics.activity}`} variant="outlined" />
        <Chip
          size="small"
          label={`student summaries: ${analytics.studentSummaries}`}
          variant="outlined"
        />
        <Chip
          size="small"
          label={`assignment analytics: ${analytics.assignmentAnalytics}`}
          variant="outlined"
        />
        <Chip
          size="small"
          label={`Statistics (page views): ${capabilities.permissions.viewStatistics ? 'ok' : 'forbidden'}`}
          variant="outlined"
        />
        <Chip size="small" label={`gradebook: ${gradebook.level}`} variant="outlined" />
        <Chip size="small" label={`discussions: ${discussions}`} variant="outlined" />
      </Box>
      <Typography variant="body2" color="text.secondary">
        {capabilities.tabNotes.engagement} {capabilities.tabNotes.students}
      </Typography>
      <Typography variant="caption" display="block" color="text.secondary" sx={{ mt: 0.5 }}>
        Probed at {checkedLabel}. Re-select the course to refresh.
      </Typography>
    </Alert>
  );
}
