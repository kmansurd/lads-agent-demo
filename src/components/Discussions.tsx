'use client';
import React, { useEffect, useState } from 'react';
import dynamic from 'next/dynamic';
import { Box, List, ListItem, ListItemButton, ListItemText, Typography, Paper, CircularProgress } from '@mui/material';
import { useCourse } from '@/context/CourseContext';
import { TabLoader } from '@/components/CourseDataState';
import type { DiscussionListItem, DiscussionGraph } from '@/lib/canvas/discussions';

const DiscussionNetwork = dynamic(() => import('./DiscussionNetwork'), {
  ssr: false,
  loading: () => <p>Loading network...</p>,
});

type DiscussionsResponse = { discussions: DiscussionListItem[] };

const Discussions = () => {
  const { courseId } = useCourse();
  const [list, setList] = useState<DiscussionListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [detailSummary, setDetailSummary] = useState('');
  const [graphData, setGraphData] = useState<DiscussionGraph | null>(null);
  const [graphLoading, setGraphLoading] = useState(false);

  const selected = list.find((d) => d.id === selectedId) ?? null;

  useEffect(() => {
    if (!courseId) return;
    setLoading(true);
    setError(null);
    fetch(`/api/courses/${courseId}/discussions`)
      .then(async (res) => {
        const body = await res.json();
        if (!res.ok) throw new Error(body.error ?? 'Failed to load discussions');
        setList(body.discussions ?? []);
        setSelectedId(body.discussions?.[0]?.id ?? null);
      })
      .catch((e) => {
        setError(e instanceof Error ? e.message : 'Failed to load');
        setList([]);
        setSelectedId(null);
      })
      .finally(() => setLoading(false));
  }, [courseId]);

  useEffect(() => {
    if (!courseId || selectedId == null) {
      setGraphData(null);
      setDetailSummary('');
      return;
    }
    setGraphLoading(true);
    fetch(`/api/courses/${courseId}/discussions/${selectedId}`)
      .then(async (res) => {
        const body = await res.json();
        if (!res.ok) throw new Error(body.error ?? 'Failed to load discussion');
        setGraphData(body.graphData);
        setDetailSummary(body.summary ?? '');
      })
      .catch(() => setGraphData({ nodes: [], links: [] }))
      .finally(() => setGraphLoading(false));
  }, [courseId, selectedId]);

  if (loading || error) {
    return <TabLoader loading={loading} error={error} />;
  }

  if (list.length === 0) {
    return (
      <Typography color="text.secondary" sx={{ p: 2 }}>
        No discussion topics in this course.
      </Typography>
    );
  }

  return (
    <Box sx={{ display: 'flex' }}>
      <Box sx={{ width: 300, borderRight: '1px solid #ddd' }}>
        <List>
          {list.map((discussion) => (
            <ListItem key={discussion.id} disablePadding>
              <ListItemButton
                onClick={() => setSelectedId(discussion.id)}
                selected={selectedId === discussion.id}
              >
                <ListItemText
                  primary={discussion.title}
                  secondary={`${discussion.participants} posts`}
                />
              </ListItemButton>
            </ListItem>
          ))}
        </List>
      </Box>
      <Box sx={{ flexGrow: 1, p: 3, overflow: 'hidden' }}>
        {selected && (
          <>
            <Paper elevation={3} sx={{ p: 2, mb: 3 }}>
              <Typography variant="h6">Summary</Typography>
              <Typography>{detailSummary || selected.summary}</Typography>
            </Paper>
            <Box sx={{ height: 500, border: '1px solid #ddd', borderRadius: 1, position: 'relative' }}>
              {graphLoading && (
                <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%' }}>
                  <CircularProgress />
                </Box>
              )}
              {!graphLoading && graphData && graphData.nodes.length > 0 && (
                <DiscussionNetwork data={graphData} />
              )}
              {!graphLoading && graphData && graphData.nodes.length === 0 && (
                <Typography sx={{ p: 2 }} color="text.secondary">
                  No reply graph for this topic yet.
                </Typography>
              )}
            </Box>
          </>
        )}
      </Box>
    </Box>
  );
};

export default Discussions;
