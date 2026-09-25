import { canvasRequest, fetchAllPages, mapPool } from './client';

type DiscussionTopic = {
  id: number;
  title?: string;
  message?: string;
  discussion_subentry_count?: number;
  posted_at?: string;
  user_name?: string;
};

type DiscussionEntry = {
  id: number;
  user_id?: number;
  user_name?: string;
  message?: string;
  created_at?: string;
  parent_id?: number | null;
  recent_replies?: DiscussionEntry[];
};

export type DiscussionListItem = {
  id: number;
  title: string;
  participants: number;
  summary: string;
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
  return html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
}

function buildGraphFromEntries(entries: DiscussionEntry[]): DiscussionGraph {
  const nodes = new Map<
    string,
    { posts: number; replies: number; postsContent: string[]; group: number }
  >();
  const linkCounts = new Map<string, number>();
  const entryAuthor = new Map<number, string>();

  for (const entry of entries) {
    const author = entry.user_name || `User ${entry.user_id ?? entry.id}`;
    entryAuthor.set(entry.id, author);
    const existing = nodes.get(author) ?? {
      posts: 0,
      replies: 0,
      postsContent: [],
      group: (entry.user_id ?? 0) % 5,
    };
    existing.posts += 1;
    if (entry.message) {
      const text = stripHtml(entry.message);
      if (text) existing.postsContent.push(text.slice(0, 200));
    }
    nodes.set(author, existing);

    if (entry.parent_id) {
      const parentAuthor = entryAuthor.get(entry.parent_id);
      if (parentAuthor && parentAuthor !== author) {
        const key = `${author}→${parentAuthor}`;
        linkCounts.set(key, (linkCounts.get(key) ?? 0) + 1);
        const replyNode = nodes.get(author)!;
        replyNode.replies += 1;
      }
    }

    for (const reply of entry.recent_replies ?? []) {
      const replyAuthor = reply.user_name || `User ${reply.user_id ?? reply.id}`;
      const parent = entry.user_name || author;
      if (replyAuthor !== parent) {
        const key = `${replyAuthor}→${parent}`;
        linkCounts.set(key, (linkCounts.get(key) ?? 0) + 1);
        const rn = nodes.get(replyAuthor) ?? {
          posts: 0,
          replies: 0,
          postsContent: [],
          group: (reply.user_id ?? 0) % 5,
        };
        rn.replies += 1;
        nodes.set(replyAuthor, rn);
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
  const topics = await fetchAllPages<DiscussionTopic>(
    `/courses/${courseId}/discussion_topics`,
    { only_announcements: 'false', include: ['all_dates'] },
  );

  return topics
    .filter((t) => t.title)
    .map((t) => ({
      id: t.id,
      title: t.title ?? 'Untitled discussion',
      participants: t.discussion_subentry_count ?? 0,
      summary: t.message ? stripHtml(t.message).slice(0, 280) : 'No description.',
    }));
}

export async function getDiscussionDetail(
  courseId: string,
  topicId: string,
): Promise<{ summary: string; graphData: DiscussionGraph }> {
  const [topicMeta, entries] = await Promise.all([
    canvasRequest<DiscussionTopic>(
      `/courses/${courseId}/discussion_topics/${topicId}`,
    ).catch(() => ({ title: 'Discussion' }) as DiscussionTopic),
    fetchAllPages<DiscussionEntry>(
      `/courses/${courseId}/discussion_topics/${topicId}/entries`,
      { per_page: '100' },
    ),
  ]);
  const title = topicMeta?.title ?? 'Discussion';
  const summary = topicMeta?.message
    ? stripHtml(topicMeta.message).slice(0, 500)
    : `${title} — ${entries.length} top-level entries.`;

  const graphData = buildGraphFromEntries(entries);
  return { summary, graphData };
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
