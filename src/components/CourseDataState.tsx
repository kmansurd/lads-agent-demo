'use client';

import React from 'react';
import { Alert, Box, CircularProgress } from '@mui/material';
import { useCourse } from '@/context/CourseContext';

export function CourseShell({ children }: { children: React.ReactNode }) {
  const { loading, error, courseId } = useCourse();

  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', p: 4 }}>
        <CircularProgress />
      </Box>
    );
  }

  if (error) {
    return (
      <Alert severity="warning" sx={{ m: 2 }}>
        {error}. Add CANVAS_API_URL and CANVAS_API_TOKEN to `.env.local` (see canvas.env.template).
      </Alert>
    );
  }

  if (!courseId) {
    return (
      <Alert severity="info" sx={{ m: 2 }}>
        No published Teacher, TA, Designer, or Course Admin courses were returned for this account.
      </Alert>
    );
  }

  return <>{children}</>;
}

export function TabLoader({ loading, error }: { loading: boolean; error: string | null }) {
  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', p: 4 }}>
        <CircularProgress size={32} />
      </Box>
    );
  }
  if (error) {
    return (
      <Alert severity="error" sx={{ m: 1 }}>
        {error}
      </Alert>
    );
  }
  return null;
}
