'use client';
import React, { useEffect, useState } from 'react';
import { Box, List, ListItem, ListItemButton, ListItemText, Typography, Paper } from '@mui/material';
import { useCourse } from '@/context/CourseContext';
import { TabLoader } from '@/components/CourseDataState';
import { TabDataSourceFooter } from '@/components/TabDataSourceFooter';
import { useCourseCapabilities } from '@/hooks/useCourseCapabilities';
import DiscussionEna from '@/components/DiscussionEna';
import type { DiscussionListItem, DiscussionPost, DiscussionTopicStats } from '@/lib/canvas/discussions';

const Discussions = () => {
  const { courseId } = useCourse();
  const [list, setList] = useState<DiscussionListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [detailSummary, setDetailSummary] = useState('');
  const [posts, setPosts] = useState<DiscussionPost[]>([]);
  const [stats, setStats] = useState<DiscussionTopicStats | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [listFetchedAt, setListFetchedAt] = useState<Date | null>(null);
  const [dataSources, setDataSources] = useState<string[]>([]);
  const { capabilities } = useCourseCapabilities();

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
        setDataSources(body.dataSources ?? []);
        setListFetchedAt(new Date());
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
      setDetailSummary('');
      setPosts([]);
      setStats(null);
      return;
    }
    setDetailLoading(true);
    fetch(`/api/courses/${courseId}/discussions/${selectedId}`)
      .then(async (res) => {
        const body = await res.json();
        if (!res.ok) throw new Error(body.error ?? 'Failed to load discussion');
        setDetailSummary(body.summary ?? '');
        setPosts(body.posts ?? []);
        setStats(body.stats ?? null);
      })
      .catch(() => {
        setDetailSummary('');
        setPosts([]);
        setStats(null);
      })
      .finally(() => setDetailLoading(false));
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
    <Box>
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
      <Box sx={{ flexGrow: 1, p: 3, minWidth: 0 }}>
        {selected && (
          <>
            <Paper elevation={3} sx={{ p: 2, mb: 2 }}>
              <Typography variant="h6">Topic</Typography>
              <Typography sx={{ whiteSpace: 'pre-wrap' }}>
                {detailSummary || selected.summary}
              </Typography>
              {stats && stats.numberOfPosts > 0 ? (
                <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
                  {stats.numberOfPosts.toLocaleString()} posts
                  {stats.averagePostsPerAuthor != null
                    ? ` · ${stats.averagePostsPerAuthor} per author`
                    : ''}
                  {` · median ${stats.medianWordCount} words`}
                  {stats.averageTimeToPostHours != null
                    ? ` · ${stats.averageTimeToPostHours}h average after the topic opened`
                    : ''}
                </Typography>
              ) : null}
            </Paper>
            <DiscussionEna posts={posts} prompt={detailSummary || selected.summary} loading={detailLoading} />
            <Typography variant="h6" gutterBottom>
              Posts
            </Typography>
            <Box
              sx={{
                maxHeight: 480,
                overflow: 'auto',
                border: '1px solid #ddd',
                borderRadius: 1,
                mb: 3,
              }}
            >
              {!detailLoading && posts.length === 0 ? (
                <Typography sx={{ p: 2 }} color="text.secondary">
                  No posts in this topic.
                </Typography>
              ) : null}
              {posts.map((post) => (
                <Box
                  key={post.id}
                  sx={{
                    pl: 2 + post.depth * 2,
                    pr: 2,
                    py: 1.25,
                    borderBottom: '1px solid',
                    borderColor: 'divider',
                  }}
                >
                  <Typography variant="body2" sx={{ fontWeight: 600 }}>
                    {post.authorName}
                    {post.createdAt
                      ? ` · ${new Date(post.createdAt).toLocaleString()}`
                      : ''}
                    {post.likes > 0 ? ` · ${post.likes} ${post.likes === 1 ? 'like' : 'likes'}` : ''}
                  </Typography>
                  <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap', mt: 0.5 }}>
                    {post.message || 'No message.'}
                  </Typography>
                </Box>
              ))}
            </Box>
          </>
        )}
      </Box>
    </Box>
    {dataSources.length > 0 && (
      <TabDataSourceFooter
        sources={dataSources}
        fetchedAt={listFetchedAt}
        note={capabilities?.tabNotes.discussions}
      />
    )}
    </Box>
  );
};

export default Discussions;
