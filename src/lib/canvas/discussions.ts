import { canvasRequest, fetchAllPages, mapPool } from './client';

type DiscussionTopic = {
  id: number;
  title?: string;
  message?: string;
  discussion_subentry_count?: number;
  published?: boolean;
  posted_at?: string;
  user_name?: string;
  is_announcement?: boolean;
  announcement?: boolean;
  type?: string;
};

type DiscussionEntry = {
  id: number;
  user_id?: number;
  user_name?: string;
  message?: string;
  created_at?: string;
  parent_id?: number | null;
  recent_replies?: DiscussionEntry[];
  rating_sum?: number;
  deleted?: boolean;
  replies?: DiscussionEntry[];
};

type DiscussionParticipant = {
  id: number;
  display_name?: string;
};

/** Full thread from GET /discussion_topics/:id/view (same call as ubc/canvas-discussion). */
type DiscussionView = {
  participants?: DiscussionParticipant[];
  view?: DiscussionEntry[];
};

export type DiscussionListItem = {
  id: number;
  title: string;
  participants: number;
  summary: string;
};

export type DiscussionPost = {
  id: number;
  authorId: number | null;
  authorName: string;
  message: string;
  likes: number;
  createdAt: string | null;
  parentId: number | null;
  depth: number;
};

export type DiscussionTopicStats = {
  numberOfPosts: number;
  medianWordCount: number;
  averageTimeToPostHours: number | null;
  firstReplyAt: string | null;
  averagePostsPerAuthor: number | null;
};

export type DiscussionDetail = {
  summary: string;
  posts: DiscussionPost[];
  stats: DiscussionTopicStats;
  graphData: DiscussionGraph;
};

export type DiscussionGraph = {
  nodes: {
    id: string;
    name: string;
    posts: number;
    replies: number;
    group: number;
    postsContent?: string[];
  }[];
  links: { source: string; target: string; value: number }[];
};

function stripHtml(html: string): string {
  const withImages = html.replace(/<img\b[^>]*>/gi, (tag) => {
    const alt = tag.match(/\balt=["']([^"']*)["']/i)?.[1]?.trim();
    return alt ? `\n[${alt}]\n` : '\n[image]\n';
  });
  return withImages
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function wordCount(text: string): number {
  const words = text.trim().split(/\s+/).filter(Boolean);
  return words.length;
}

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  const value = sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
  return Math.round(value * 10) / 10;
}

function authorName(
  participants: Map<number, string>,
  userId: number | undefined,
  entryId: number,
): string {
  if (userId != null) {
    return participants.get(userId) ?? `User ${userId}`;
  }
  return `User ${entryId}`;
}

function flattenViewEntries(
  entries: DiscussionEntry[],
  participants: Map<number, string>,
  depth = 0,
  parentId: number | null = null,
): DiscussionPost[] {
  const posts: DiscussionPost[] = [];
  for (const entry of entries) {
    const replies = entry.replies ?? entry.recent_replies ?? [];
    if (!entry.deleted) {
      posts.push({
        id: entry.id,
        authorId: entry.user_id ?? null,
        authorName: entry.user_name || authorName(participants, entry.user_id, entry.id),
        message: entry.message ? stripHtml(entry.message) : '',
        likes: entry.rating_sum ?? 0,
        createdAt: entry.created_at ?? null,
        parentId: entry.parent_id ?? parentId,
        depth,
      });
    }
    posts.push(
      ...flattenViewEntries(
        replies,
        participants,
        entry.deleted ? depth : depth + 1,
        entry.deleted ? parentId : entry.id,
      ),
    );
  }
  return posts;
}

function topicStats(posts: DiscussionPost[], openedAt: string | null): DiscussionTopicStats {
  if (posts.length === 0) {
    return {
      numberOfPosts: 0,
      medianWordCount: 0,
      averageTimeToPostHours: null,
      firstReplyAt: null,
      averagePostsPerAuthor: null,
    };
  }

  const opened = openedAt ? Date.parse(openedAt) : Number.NaN;
  const times = posts
    .map((post) => (post.createdAt ? Date.parse(post.createdAt) : Number.NaN))
    .filter((time) => !Number.isNaN(time));
  const firstReply = times.length > 0 ? Math.min(...times) : null;

  let averageTimeToPostHours: number | null = null;
  if (!Number.isNaN(opened) && times.length > 0) {
    const hours = times.map((time) => (time - opened) / 3_600_000);
    const avg = hours.reduce((sum, value) => sum + value, 0) / hours.length;
    averageTimeToPostHours = Math.round(avg * 10) / 10;
  }

  const byAuthor = new Map<string, number>();
  for (const post of posts) {
    const key = post.authorId != null ? String(post.authorId) : post.authorName;
    byAuthor.set(key, (byAuthor.get(key) ?? 0) + 1);
  }
  const counts = [...byAuthor.values()];
  const averagePostsPerAuthor =
    counts.length > 0
      ? Math.round((counts.reduce((sum, value) => sum + value, 0) / counts.length) * 10) / 10
      : null;

  return {
    numberOfPosts: posts.length,
    medianWordCount: median(posts.map((post) => wordCount(post.message))),
    averageTimeToPostHours,
    firstReplyAt: firstReply != null ? new Date(firstReply).toISOString() : null,
    averagePostsPerAuthor,
  };
}

function isAnnouncementTopic(topic: DiscussionTopic): boolean {
  if (topic.is_announcement === true) return true;
  if (topic.announcement === true) return true;
  const type = topic.type?.toLowerCase() ?? '';
  if (type.includes('announcement')) return true;
  return false;
}

function buildGraphFromPosts(posts: DiscussionPost[]): DiscussionGraph {
  const nodes = new Map<
    string,
    { posts: number; replies: number; postsContent: string[]; group: number }
  >();
  const linkCounts = new Map<string, number>();
  const entryAuthor = new Map<number, string>();

  for (const post of posts) {
    entryAuthor.set(post.id, post.authorName);
    const existing = nodes.get(post.authorName) ?? {
      posts: 0,
      replies: 0,
      postsContent: [],
      group: (post.authorId ?? 0) % 5,
    };
    if (post.parentId == null) existing.posts += 1;
    else existing.replies += 1;
    if (post.message) existing.postsContent.push(post.message.slice(0, 200));
    nodes.set(post.authorName, existing);

    if (post.parentId != null) {
      const parentAuthor = entryAuthor.get(post.parentId);
      if (parentAuthor && parentAuthor !== post.authorName) {
        const key = `${post.authorName}→${parentAuthor}`;
        linkCounts.set(key, (linkCounts.get(key) ?? 0) + 1);
      }
    }
  }

  const graphNodes = [...nodes.entries()].map(([name, data]) => ({
    id: name,
    name,
    posts: data.posts,
    replies: data.replies,
    group: data.group,
    postsContent: data.postsContent.slice(0, 5),
  }));

  const links: DiscussionGraph['links'] = [];
  for (const [key, value] of linkCounts) {
    const [source, target] = key.split('→');
    links.push({ source, target, value });
  }

  return { nodes: graphNodes, links };
}

export async function listCourseDiscussions(courseId: string): Promise<DiscussionListItem[]> {
  // Omit only_announcements. Canvas treats any present value as true, so
  // only_announcements=false returns announcements and hides the discussions.
  const discussionTopics = await fetchAllPages<DiscussionTopic>(
    `/courses/${courseId}/discussion_topics`,
  ).catch(() => [] as DiscussionTopic[]);

  const seen = new Set<number>();
  const topics: DiscussionTopic[] = [];

  for (const t of discussionTopics) {
    if (seen.has(t.id)) continue;
    seen.add(t.id);
    if (t.published === false) continue;
    if (isAnnouncementTopic(t)) continue;
    topics.push(t);
  }

  return topics
    .filter((t) => t.title)
    .map((t) => ({
      id: t.id,
      title: t.title ?? 'Untitled discussion',
      participants: t.discussion_subentry_count ?? 0,
      summary: t.message ? stripHtml(t.message).slice(0, 280) : 'No description.',
    }));
}

async function loadDiscussionPosts(
  courseId: string,
  topicId: string,
): Promise<DiscussionPost[]> {
  try {
    const full = await canvasRequest<DiscussionView>(
      `/courses/${courseId}/discussion_topics/${topicId}/view`,
    );
    const participants = new Map<number, string>();
    for (const person of full.participants ?? []) {
      if (person.display_name) participants.set(person.id, person.display_name);
    }
    return flattenViewEntries(full.view ?? [], participants);
  } catch {
    const entries = await fetchAllPages<DiscussionEntry>(
      `/courses/${courseId}/discussion_topics/${topicId}/entries`,
      { per_page: '100' },
    ).catch(() => [] as DiscussionEntry[]);
    return flattenViewEntries(entries, new Map());
  }
}

const emptyStats = (): DiscussionTopicStats => ({
  numberOfPosts: 0,
  medianWordCount: 0,
  averageTimeToPostHours: null,
  firstReplyAt: null,
  averagePostsPerAuthor: null,
});

export async function getDiscussionDetail(
  courseId: string,
  topicId: string,
): Promise<DiscussionDetail> {
  const topicMeta = await canvasRequest<DiscussionTopic>(
    `/courses/${courseId}/discussion_topics/${topicId}`,
  ).catch(() => ({ title: 'Discussion' }) as DiscussionTopic);

  if (isAnnouncementTopic(topicMeta)) {
    return {
      summary: 'This topic is a course announcement and is hidden from the Discussions view.',
      posts: [],
      stats: emptyStats(),
      graphData: { nodes: [], links: [] },
    };
  }

  const posts = await loadDiscussionPosts(courseId, topicId);
  const title = topicMeta.title ?? 'Discussion';
  const prompt = topicMeta.message ? stripHtml(topicMeta.message) : '';
  const summary = prompt || `${title} has no topic prompt.`;
  const stats = topicStats(posts, topicMeta.posted_at ?? null);

  return {
    summary,
    posts,
    stats,
    graphData: buildGraphFromPosts(posts),
  };
}

/** Prefetch graph for first N topics (used sparingly). */
export async function enrichDiscussionsWithGraphs(
  courseId: string,
  items: DiscussionListItem[],
  limit = 5,
): Promise<(DiscussionListItem & { graphData?: DiscussionGraph })[]> {
  const slice = items.slice(0, limit);
  const graphs = await mapPool(slice, 3, async (item) => {
    const detail = await getDiscussionDetail(courseId, String(item.id));
    return detail.graphData;
  });

  return items.map((item, i) => {
    if (i >= limit) return item;
    return { ...item, graphData: graphs[i] };
  });
}
