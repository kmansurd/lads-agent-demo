import { fetchAllPages } from './client';
import { buildContentMatchKeys } from './contentUrlMatch';

export type CourseContentType =
  | 'page'
  | 'file'
  | 'assignment'
  | 'quiz'
  | 'discussion'
  | 'module_item'
  | 'external';

export type CourseContentRow = {
  /** Stable row id for the grid (type + canvas id). */
  id: string;
  canvasId: number;
  title: string;
  type: CourseContentType;
  published: boolean;
  /** Assignments/quizzes with points; null for non-gradeable types. */
  graded: boolean | null;
  pageViews: number | null;
  participations: number | null;
  students: number | null;
  /** URL path keys for matching page-view history (not shown in UI). */
  matchKeys: string[];
};

type AssignmentRow = {
  id: number;
  name: string;
  published?: boolean;
  points_possible?: number;
};

type PageRow = {
  page_id: number;
  title?: string;
  url?: string;
  published?: boolean;
};

type FileRow = {
  id: number;
  display_name?: string;
  hidden?: boolean;
  locked?: boolean;
};

type QuizRow = {
  id: number;
  title?: string;
  published?: boolean;
  points_possible?: number;
};

type DiscussionRow = {
  id: number;
  title?: string;
  published?: boolean;
  is_announcement?: boolean;
};

type ModuleItem = {
  id: number;
  title: string;
  type: string;
  published?: boolean;
  content_id?: number;
  page_url?: string;
  html_url?: string;
};

function rowKey(type: CourseContentType, canvasId: number): string {
  return `${type}-${canvasId}`;
}

function upsert(
  map: Map<string, CourseContentRow>,
  row: CourseContentRow,
): void {
  const existing = map.get(row.id);
  if (!existing) {
    map.set(row.id, row);
    return;
  }
  if (!existing.published && row.published) {
    map.set(row.id, { ...existing, published: true });
  }
}

export async function listCourseContentCatalog(
  courseId: string,
): Promise<CourseContentRow[]> {
  const map = new Map<string, CourseContentRow>();

  const [assignments, pages, files, quizzes, topics, modules] = await Promise.all([
    fetchAllPages<AssignmentRow>(`/courses/${courseId}/assignments`).catch(() => []),
    fetchAllPages<PageRow>(`/courses/${courseId}/pages`).catch(() => []),
    fetchAllPages<FileRow>(`/courses/${courseId}/files`).catch(() => []),
    fetchAllPages<QuizRow>(`/courses/${courseId}/quizzes`).catch(() => []),
    fetchAllPages<DiscussionRow>(`/courses/${courseId}/discussion_topics`, {
      only_announcements: 'false',
    }).catch(() => []),
    fetchAllPages<{ items?: ModuleItem[] }>(`/courses/${courseId}/modules`, {
      'include[]': 'items',
    }).catch(() => []),
  ]);

  for (const a of assignments) {
    const published = a.published !== false;
    upsert(map, {
      id: rowKey('assignment', a.id),
      canvasId: a.id,
      title: a.name,
      type: 'assignment',
      published,
      graded: (a.points_possible ?? 0) > 0,
      pageViews: null,
      participations: null,
      students: null,
      matchKeys: buildContentMatchKeys(courseId, 'assignment', a.id),
    });
  }

  for (const p of pages) {
    const published = p.published !== false;
    upsert(map, {
      id: rowKey('page', p.page_id),
      canvasId: p.page_id,
      title: p.title ?? p.url ?? `Page ${p.page_id}`,
      type: 'page',
      published,
      graded: null,
      pageViews: null,
      participations: null,
      students: null,
      matchKeys: buildContentMatchKeys(courseId, 'page', p.page_id, {
        pageSlug: p.url,
      }),
    });
  }

  for (const f of files) {
    const published = f.hidden !== true && f.locked !== true;
    upsert(map, {
      id: rowKey('file', f.id),
      canvasId: f.id,
      title: f.display_name ?? `File ${f.id}`,
      type: 'file',
      published,
      graded: null,
      pageViews: null,
      participations: null,
      students: null,
      matchKeys: buildContentMatchKeys(courseId, 'file', f.id),
    });
  }

  for (const q of quizzes) {
    const published = q.published !== false;
    upsert(map, {
      id: rowKey('quiz', q.id),
      canvasId: q.id,
      title: q.title ?? `Quiz ${q.id}`,
      type: 'quiz',
      published,
      graded: (q.points_possible ?? 0) > 0,
      pageViews: null,
      participations: null,
      students: null,
      matchKeys: buildContentMatchKeys(courseId, 'quiz', q.id),
    });
  }

  for (const t of topics) {
    if (t.is_announcement === true) continue;
    const published = t.published !== false;
    upsert(map, {
      id: rowKey('discussion', t.id),
      canvasId: t.id,
      title: t.title ?? `Discussion ${t.id}`,
      type: 'discussion',
      published,
      graded: null,
      pageViews: null,
      participations: null,
      students: null,
      matchKeys: buildContentMatchKeys(courseId, 'discussion', t.id),
    });
  }

  for (const mod of modules) {
    for (const item of mod.items ?? []) {
      if (item.type === 'SubHeader' || item.type === 'ContextModuleSubHeader') continue;
      const published = item.published !== false;
      const type: CourseContentType =
        item.type === 'ExternalUrl' || item.type === 'ExternalTool'
          ? 'external'
          : 'module_item';
      upsert(map, {
        id: rowKey(type, item.id),
        canvasId: item.id,
        title: item.title,
        type,
        published,
        graded: null,
        pageViews: null,
        participations: null,
        students: null,
        matchKeys: buildContentMatchKeys(courseId, type, item.id, {
          pageSlug: item.page_url,
          htmlUrl: item.html_url,
        }),
      });
    }
  }

  const rows = [...map.values()];
  rows.sort((a, b) => {
    if (a.published !== b.published) return a.published ? -1 : 1;
    return a.title.localeCompare(b.title, undefined, { sensitivity: 'base' });
  });
  return rows;
}

export function applyAssignmentAnalyticsToContent(
  rows: CourseContentRow[],
  analyticsByAssignmentId: Map<
    number,
    {
      pageViews: number | null;
      participations: number | null;
      students: number | null;
    }
  >,
): void {
  for (const row of rows) {
    if (row.type !== 'assignment') continue;
    const metrics = analyticsByAssignmentId.get(row.canvasId);
    if (!metrics) continue;
    row.pageViews = metrics.pageViews;
    row.participations = metrics.participations;
    row.students = metrics.students;
  }
}
