'use client';

import React, { useEffect, useState } from 'react';
import {
  Box,
  Button,
  CircularProgress,
  Grid,
  Paper,
  Typography,
} from '@mui/material';
import { useCourse } from '@/context/CourseContext';
import { useCanvasAuth } from '@/context/CanvasAuthContext';
import { type CourseView, useNavigation } from '@/context/NavigationContext';
import { fetchWithCanvasAuth } from '@/lib/client/canvasTokenStorage';
type SummaryKey = 'grades' | 'engagement' | 'students' | 'discussions';

const SUMMARY_TABS: { view: CourseView; tab: SummaryKey; title: string }[] = [
  { view: 'grades', tab: 'grades', title: 'Gradebook' },
  { view: 'engagement', tab: 'engagement', title: 'Engagement' },
  { view: 'students', tab: 'students', title: 'Students' },
  { view: 'discussions', tab: 'discussions', title: 'Discussions' },
];

export function Overview() {
  const { courseId } = useCourse();
  const { tokenRevision, authReady } = useCanvasAuth();
  const { setView } = useNavigation();
  const [summaries, setSummaries] = useState<Partial<Record<SummaryKey, string>>>({});
  const [errors, setErrors] = useState<Partial<Record<SummaryKey, string>>>({});
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!authReady || !courseId) {
      setSummaries({});
      setErrors({});
      return;
    }

    let cancelled = false;
    setLoading(true);
    setErrors({});

    Promise.allSettled(
      SUMMARY_TABS.map(async ({ tab }) => {
        const res = await fetchWithCanvasAuth(`/api/courses/${courseId}/summary?tab=${tab}`);
        const body = await res.json();
        if (!res.ok) {
          throw new Error(body.error ?? 'Failed to load summary');
        }
        return { tab, summary: body.summary as string };
      }),
    ).then((results) => {
      if (cancelled) return;
      const next: Partial<Record<SummaryKey, string>> = {};
      const nextErrors: Partial<Record<SummaryKey, string>> = {};
      results.forEach((result, index) => {
        const tab = SUMMARY_TABS[index].tab;
        if (result.status === 'fulfilled') {
          next[tab] = result.value.summary;
        } else {
          nextErrors[tab] =
            result.reason instanceof Error ? result.reason.message : 'Could not load this section';
        }
      });
      setSummaries(next);
      setErrors(nextErrors);
      setLoading(false);
    });

    return () => {
      cancelled = true;
    };
  }, [authReady, courseId, tokenRevision]);

  if (!courseId) {
    return (
      <Typography variant="body2" color="text.secondary">
        Select a course in Settings to see your overview.
      </Typography>
    );
  }

  if (loading && Object.keys(summaries).length === 0) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', py: 6 }}>
        <CircularProgress size={36} />
      </Box>
    );
  }

  return (
    <Box>
      <Typography variant="h5" sx={{ mb: 0.5, fontWeight: 600, letterSpacing: '-0.02em' }}>
        Overview
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 3, maxWidth: 640 }}>
        Highlights from gradebook, engagement, students, and discussions for this course.
      </Typography>
      <Grid container spacing={2.5}>
        {SUMMARY_TABS.map(({ view, tab, title }) => {
          const text = summaries[tab];
          const err = errors[tab];
          return (
            <Grid key={tab} size={{ xs: 12, md: 6 }}>
              <Paper
                sx={{
                  p: { xs: 2, sm: 2.5 },
                  height: '100%',
                  minHeight: 168,
                  display: 'flex',
                  flexDirection: 'column',
                }}
              >
                <Typography variant="subtitle1" sx={{ fontWeight: 600, mb: 1.5 }}>
                  {title}
                </Typography>
                {loading && !text ? (
                  <Box sx={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <CircularProgress size={24} />
                  </Box>
                ) : err ? (
                  <Typography variant="body2" color="error" sx={{ flex: 1 }}>
                    {err}
                  </Typography>
                ) : (
                  <Typography variant="body2" color="text.secondary" sx={{ flex: 1, lineHeight: 1.55 }}>
                    {text ?? 'No summary available.'}
                  </Typography>
                )}
                <Box sx={{ pt: 2, display: 'flex', justifyContent: 'flex-end' }}>
                  <Button
                    variant="text"
                    color="primary"
                    onClick={() => setView(view)}
                    sx={{ fontWeight: 500, px: 1 }}
                  >
                    See more
                  </Button>
                </Box>
              </Paper>
            </Grid>
          );
        })}
      </Grid>
    </Box>
  );
}
