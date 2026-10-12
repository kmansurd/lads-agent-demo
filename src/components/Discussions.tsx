'use client';
import React, { useEffect, useState } from 'react';
import {
  Box,
  FormControl,
  InputLabel,
  List,
  ListItem,
  ListItemButton,
  ListItemText,
  MenuItem,
  Paper,
  Select,
  Tab,
  Tabs,
  Typography,
} from '@mui/material';
import { useCourse } from '@/context/CourseContext';
import { fetchWithCanvasAuth } from '@/lib/client/canvasTokenStorage';
import { TabLoader } from '@/components/CourseDataState';
import { TabDataSourceFooter } from '@/components/TabDataSourceFooter';
import { useCourseCapabilities } from '@/hooks/useCourseCapabilities';
import DiscussionEna from '@/components/DiscussionEna';
import type {
  DiscussionGroupChoice,
  DiscussionListItem,
  DiscussionPost,
  DiscussionTopicStats,
} from '@/lib/canvas/discussions';

type Scope = 'course' | 'groups';

const DISCUSSION_LIST_WIDTH = 300;

const discussionListItemTextProps = {
  primaryTypographyProps: {
    variant: 'body2' as const,
    sx: {
      fontWeight: 400,
      display: '-webkit-box',
      WebkitLineClamp: 3,
      WebkitBoxOrient: 'vertical' as const,
      overflow: 'hidden',
      wordBreak: 'break-word',
    },
  },
  secondaryTypographyProps: {
    variant: 'caption' as const,
    sx: { fontWeight: 400 },
  },
};

const discussionListButtonSx = {
  alignItems: 'flex-start',
  py: 1.25,
  '&.Mui-selected': {
    bgcolor: 'action.selected',
    '&:hover': { bgcolor: 'action.selected' },
  },
  '&.Mui-selected .MuiListItemText-primary': {
    fontWeight: 400,
  },
  '&.Mui-selected .MuiListItemText-secondary': {
    fontWeight: 400,
  },
  '&.Mui-focusVisible': {
    bgcolor: 'action.hover',
  },
};

function DiscussionSidebar({
  items,
  selectedId,
  onSelect,
}: {
  items: DiscussionListItem[];
  selectedId: number | null;
  onSelect: (id: number) => void;
}) {
  return (
    <Box
      sx={{
        width: DISCUSSION_LIST_WIDTH,
        minWidth: DISCUSSION_LIST_WIDTH,
        maxWidth: DISCUSSION_LIST_WIDTH,
        flexShrink: 0,
        borderRight: '1px solid',
        borderColor: 'divider',
        overflowY: 'auto',
        alignSelf: 'stretch',
      }}
    >
      <List disablePadding>
        {items.map((discussion) => (
          <ListItem key={discussion.id} disablePadding>
            <ListItemButton
              onClick={() => onSelect(discussion.id)}
              selected={selectedId === discussion.id}
              sx={discussionListButtonSx}
            >
              <ListItemText
                primary={discussion.title}
                secondary={`${discussion.participants} posts`}
                {...discussionListItemTextProps}
              />
            </ListItemButton>
          </ListItem>
        ))}
      </List>
    </Box>
  );
}

function PostList({
  posts,
  loading,
  emptyLabel,
}: {
  posts: DiscussionPost[];
  loading: boolean;
  emptyLabel: string;
}) {
  return (
    <>
      <Typography variant="h6" gutterBottom>
        Posts
      </Typography>
      <Box
        sx={{
          maxHeight: 480,
          overflow: 'auto',
          border: '1px solid',
          borderColor: 'divider',
          borderRadius: 3,
          mb: 3,
        }}
      >
        {!loading && posts.length === 0 ? (
          <Typography sx={{ p: 2 }} color="text.secondary">
            {emptyLabel}
          </Typography>
        ) : null}
        {posts.map((post) => (
          <Box
            key={`${post.topicId ?? 'topic'}-${post.id}`}
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
              {post.createdAt ? ` · ${new Date(post.createdAt).toLocaleString()}` : ''}
              {post.likes > 0 ? ` · ${post.likes} ${post.likes === 1 ? 'like' : 'likes'}` : ''}
            </Typography>
            <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap', mt: 0.5 }}>
              {post.message || 'No message.'}
            </Typography>
          </Box>
        ))}
      </Box>
    </>
  );
}

function StatsLine({ stats }: { stats: DiscussionTopicStats | null }) {
  return (
    <Box sx={{ minHeight: 24, mt: 1 }}>
      {stats && stats.numberOfPosts > 0 ? (
        <Typography variant="body2" color="text.secondary">
          {stats.numberOfPosts.toLocaleString()} posts
          {stats.averagePostsPerAuthor != null ? ` · ${stats.averagePostsPerAuthor} per author` : ''}
          {` · median ${stats.medianWordCount} words`}
          {stats.averageTimeToPostHours != null
            ? ` · ${stats.averageTimeToPostHours}h average after the topic opened`
            : ''}
        </Typography>
      ) : null}
    </Box>
  );
}

const Discussions = () => {
  const { courseId } = useCourse();
  const [scope, setScope] = useState<Scope>('course');
  const [list, setList] = useState<DiscussionListItem[]>([]);
  const [groups, setGroups] = useState<DiscussionGroupChoice[]>([]);
  const [hasGroups, setHasGroups] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [detailSummary, setDetailSummary] = useState('');
  const [posts, setPosts] = useState<DiscussionPost[]>([]);
  const [stats, setStats] = useState<DiscussionTopicStats | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [listFetchedAt, setListFetchedAt] = useState<Date | null>(null);
  const [dataSources, setDataSources] = useState<string[]>([]);
  const [activeGroupId, setActiveGroupId] = useState<number | null>(null);
  const [groupList, setGroupList] = useState<DiscussionListItem[]>([]);
  const [selectedGroupTopicId, setSelectedGroupTopicId] = useState<number | null>(null);
  const [groupSummary, setGroupSummary] = useState('');
  const [groupPosts, setGroupPosts] = useState<DiscussionPost[]>([]);
  const [groupStats, setGroupStats] = useState<DiscussionTopicStats | null>(null);
  const [groupListLoading, setGroupListLoading] = useState(false);
  const [groupLoading, setGroupLoading] = useState(false);
  const { capabilities } = useCourseCapabilities();

  const selected = list.find((discussion) => discussion.id === selectedId) ?? null;

  useEffect(() => {
    if (!courseId) return;
    setLoading(true);
    setError(null);
    setScope('course');
    setGroups([]);
    setHasGroups(false);
    setActiveGroupId(null);
    fetchWithCanvasAuth(`/api/courses/${courseId}/discussions`)
      .then(async (res) => {
        const body = await res.json();
        if (!res.ok) throw new Error(body.error ?? 'Failed to load discussions');
        const courseDiscussions = (body.courseDiscussions ?? body.discussions ?? []) as DiscussionListItem[];
        const nextGroups = (body.groups ?? []) as DiscussionGroupChoice[];
        setList(courseDiscussions);
        setGroups(nextGroups);
        setHasGroups(body.hasGroups === true && nextGroups.length > 0);
        setDataSources(body.dataSources ?? []);
        setListFetchedAt(new Date());
        setSelectedId(courseDiscussions[0]?.id ?? null);
        setActiveGroupId(nextGroups[0]?.id ?? null);
      })
      .catch((e) => {
        setError(e instanceof Error ? e.message : 'Failed to load');
        setList([]);
        setSelectedId(null);
      })
      .finally(() => setLoading(false));
  }, [courseId]);

  useEffect(() => {
    if (!courseId || selectedId == null || scope !== 'course') {
      if (scope !== 'course') return;
      setDetailSummary('');
      setPosts([]);
      setStats(null);
      return;
    }
    setDetailLoading(true);
    fetchWithCanvasAuth(`/api/courses/${courseId}/discussions/${selectedId}`)
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
  }, [courseId, selectedId, scope]);

  useEffect(() => {
    if (!courseId || scope !== 'groups' || activeGroupId == null) return;
    let cancelled = false;
    setGroupListLoading(true);
    setGroupList([]);
    setSelectedGroupTopicId(null);
    setGroupPosts([]);
    setGroupStats(null);
    setGroupSummary('');
    fetchWithCanvasAuth(`/api/courses/${courseId}/discussions/group?groupId=${activeGroupId}`)
      .then(async (res) => {
        const body = await res.json();
        if (!res.ok) throw new Error(body.error ?? 'Failed to load group discussions');
        if (cancelled) return;
        const discussions = (body.discussions ?? []) as DiscussionListItem[];
        setGroupList(discussions);
        setSelectedGroupTopicId(discussions[0]?.id ?? null);
      })
      .catch(() => {
        if (cancelled) return;
        setGroupList([]);
        setSelectedGroupTopicId(null);
      })
      .finally(() => {
        if (!cancelled) setGroupListLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [courseId, scope, activeGroupId]);

  useEffect(() => {
    if (!courseId || scope !== 'groups' || activeGroupId == null || selectedGroupTopicId == null) {
      return;
    }
    let cancelled = false;
    setGroupLoading(true);
    fetchWithCanvasAuth(
      `/api/courses/${courseId}/discussions/group?groupId=${activeGroupId}&topicId=${selectedGroupTopicId}`,
    )
      .then(async (res) => {
        const body = await res.json();
        if (!res.ok) throw new Error(body.error ?? 'Failed to load discussion');
        if (cancelled) return;
        setGroupSummary(body.summary ?? '');
        setGroupPosts(body.posts ?? []);
        setGroupStats(body.stats ?? null);
      })
      .catch(() => {
        if (cancelled) return;
        setGroupSummary('');
        setGroupPosts([]);
        setGroupStats(null);
      })
      .finally(() => {
        if (!cancelled) setGroupLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [courseId, scope, activeGroupId, selectedGroupTopicId]);

  if (loading || error) {
    return <TabLoader loading={loading} error={error} />;
  }

  return (
    <Box>
      <Tabs
        value={scope}
        onChange={(_, value: Scope) => setScope(value)}
        sx={{ borderBottom: 1, borderColor: 'divider', mb: 2 }}
      >
        <Tab value="course" label="Course-wide" />
        {hasGroups ? <Tab value="groups" label="Groups" /> : null}
      </Tabs>

      {scope === 'course' ? (
        list.length === 0 ? (
          <Typography color="text.secondary" sx={{ p: 2 }}>
            No course-wide discussion topics in this course.
          </Typography>
        ) : (
          <Box sx={{ display: 'flex', alignItems: 'flex-start' }}>
            <DiscussionSidebar
              items={list}
              selectedId={selectedId}
              onSelect={setSelectedId}
            />
            <Box sx={{ flex: 1, p: 3, minWidth: 0 }}>
              {selected ? (
                <>
                  <Paper elevation={3} sx={{ p: 2, mb: 2 }}>
                    <Typography variant="h6">Topic</Typography>
                    <Typography sx={{ whiteSpace: 'pre-wrap' }}>
                      {detailSummary || selected.summary}
                    </Typography>
                    <StatsLine stats={stats} />
                  </Paper>
                  <DiscussionEna
                    posts={posts}
                    prompt={detailSummary || selected.summary}
                    loading={detailLoading}
                  />
                  <PostList posts={posts} loading={detailLoading} emptyLabel="No posts in this topic." />
                </>
              ) : null}
            </Box>
          </Box>
        )
      ) : (
        <Box>
          <FormControl size="small" sx={{ minWidth: 260, mb: 2, ml: 1 }}>
            <InputLabel id="discussion-group-label">Group</InputLabel>
            <Select
              labelId="discussion-group-label"
              label="Group"
              value={activeGroupId ?? ''}
              onChange={(event) => setActiveGroupId(Number(event.target.value))}
            >
              {groups.map((group) => (
                <MenuItem key={group.id} value={group.id}>
                  {group.name}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
          {groupListLoading ? (
            <TabLoader loading error={null} />
          ) : groupList.length === 0 ? (
            <Typography color="text.secondary" sx={{ p: 2 }}>
              No discussion posts in this group.
            </Typography>
          ) : (
            <Box sx={{ display: 'flex', alignItems: 'flex-start' }}>
              <DiscussionSidebar
                items={groupList}
                selectedId={selectedGroupTopicId}
                onSelect={setSelectedGroupTopicId}
              />
              <Box sx={{ flex: 1, p: 3, minWidth: 0 }}>
                <Paper elevation={3} sx={{ p: 2, mb: 2 }}>
                  <Typography variant="h6">Topic</Typography>
                  <Typography sx={{ whiteSpace: 'pre-wrap' }}>
                    {groupSummary ||
                      groupList.find((discussion) => discussion.id === selectedGroupTopicId)?.summary}
                  </Typography>
                  <StatsLine stats={groupStats} />
                </Paper>
                <DiscussionEna
                  posts={groupPosts}
                  prompt={
                    groupSummary ||
                    groupList.find((discussion) => discussion.id === selectedGroupTopicId)?.summary ||
                    ''
                  }
                  loading={groupLoading}
                />
                <PostList
                  posts={groupPosts}
                  loading={groupLoading}
                  emptyLabel="No posts in this topic."
                />
              </Box>
            </Box>
          )}
        </Box>
      )}

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
