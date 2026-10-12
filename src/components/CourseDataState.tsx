'use client';

import React from 'react';
import { Alert, Box, CircularProgress } from '@mui/material';
import { useCourse } from '@/context/CourseContext';
import { useCanvasAuth } from '@/context/CanvasAuthContext';

export function CourseShell({ children }: { children: React.ReactNode }) {
  const { loading, error, courseId } = useCourse();
  const { authReady } = useCanvasAuth();

  if (!authReady || loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', p: 4 }}>
        <CircularProgress />
      </Box>
    );
  }

  if (error) {
    return (
      <Alert severity="warning" sx={{ m: 2 }}>
        {error}. Open Settings in the sidebar, paste your Canvas personal access token, and click Save
        token.
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
