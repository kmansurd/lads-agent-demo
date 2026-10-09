import { fetchAllPages } from './client';

export type CourseResourceType =
  | 'home'
  | 'page'
  | 'assignment'
  | 'quiz'
  | 'discussion'
  | 'file'
  | 'external';

export type CourseResource = {
  /** Stable row id for the UI (module item id or synthetic). */
  id: number;
  title: string;
  type: CourseResourceType;
  position: number;
  /** Keys used to match analytics participation URLs and page-view URLs. */
  matchKeys: string[];
  assignmentId?: number;
  quizId?: number;
  /** Canvas content id (page_id, file id, discussion id, etc.) when known. */
  contentId?: number;
};

type ModuleItem = {
  id: number;
  title: string;
  type: string;
  position: number;
  content_id?: number;
  page_url?: string;
  html_url?: string;
  published?: boolean;
};

type Module = {
  id: number;
  name: string;
  position: number;
  items?: ModuleItem[];
};

const SKIP_MODULE_TYPES = new Set(['SubHeader', 'ContextModuleSubHeader', 'ExternalTool']);

function pathKey(pathname: string): string {
  return pathname.replace(/\/+$/, '').toLowerCase();
}

function buildMatchKeys(courseId: string, item: ModuleItem): string[] {
  const keys = new Set<string>();
  const cid = courseId;

  if (item.html_url) {
    try {
      keys.add(pathKey(new URL(item.html_url).pathname));
    } catch {
      // ignore malformed URLs
    }
  }

  switch (item.type) {
    case 'Page':
      if (item.page_url) keys.add(pathKey(`/courses/${cid}/pages/${item.page_url}`));
      break;
    case 'Assignment':
      if (item.content_id) {
        keys.add(pathKey(`/courses/${cid}/assignments/${item.content_id}`));
      }
      break;
    case 'Quiz':
      if (item.content_id) {
        keys.add(pathKey(`/courses/${cid}/quizzes/${item.content_id}`));
        keys.add(pathKey(`/courses/${cid}/quizzes/${item.content_id}/take`));
      }
      break;
    case 'Discussion':
      if (item.content_id) {
        keys.add(pathKey(`/courses/${cid}/discussion_topics/${item.content_id}`));
      }
      break;
    case 'File':
      if (item.content_id) {
        keys.add(pathKey(`/courses/${cid}/files/${item.content_id}`));
      }
      break;
    default:
      break;
  }

  keys.add(pathKey(`/courses/${cid}/modules/items/${item.id}`));
  return Array.from(keys);
}

function itemToResourceType(type: string): CourseResourceType | null {
  switch (type) {
    case 'Page':
      return 'page';
    case 'Assignment':
      return 'assignment';
    case 'Quiz':
      return 'quiz';
    case 'Discussion':
      return 'discussion';
    case 'File':
      return 'file';
    case 'ExternalUrl':
    case 'ExternalTool':
      return 'external';
    default:
      return SKIP_MODULE_TYPES.has(type) ? null : 'external';
  }
}

/**
 * Published module items represent the same "Resources" set shown in Canvas New Analytics.
 */
export async function listCourseResources(courseId: string): Promise<CourseResource[]> {
  const modules = await fetchAllPages<Module>(`/courses/${courseId}/modules`, {
    'include[]': 'items',
  });

  const resources: CourseResource[] = [];
  let order = 0;

  resources.push({
    id: -1,
    title: 'Course home',
    type: 'home',
    position: order++,
    matchKeys: [
      pathKey(`/courses/${courseId}`),
      pathKey(`/courses/${courseId}/`),
    ],
  });

  const seen = new Set<string>();

  const sortedModules = [...modules].sort((a, b) => a.position - b.position);
  for (const mod of sortedModules) {
    const items = [...(mod.items ?? [])].sort((a, b) => a.position - b.position);
    for (const item of items) {
      if (item.published === false) continue;
      const type = itemToResourceType(item.type);
      if (!type) continue;

      const dedupeKey = `${item.type}:${item.content_id ?? item.id}:${item.page_url ?? ''}`;
      if (seen.has(dedupeKey)) continue;
      seen.add(dedupeKey);

      resources.push({
        id: item.id,
        title: item.title,
        type,
        position: order++,
        matchKeys: buildMatchKeys(courseId, item),
        assignmentId: item.type === 'Assignment' ? item.content_id : undefined,
        quizId: item.type === 'Quiz' ? item.content_id : undefined,
        contentId: item.content_id,
      });
    }
  }

  return resources;
}

export function matchUrlToResourceKey(url: string, courseId: string): string | null {
  try {
    const u = new URL(url);
    const pathname = pathKey(u.pathname);
    if (!pathname.includes(`/courses/${courseId}`)) return null;
    return pathname.replace(/\/take$/, '');
  } catch {
    return null;
  }
}

export function findResourceForUrl(
  resources: CourseResource[],
  url: string,
  courseId: string,
): CourseResource | undefined {
  const key = matchUrlToResourceKey(url, courseId);
  if (!key) return undefined;

  const courseRoot = pathKey(`/courses/${courseId}`);
  if (key === courseRoot) {
    return resources.find((r) => r.type === 'home');
  }

  let best: CourseResource | undefined;
  let bestLen = 0;

  for (const resource of resources) {
    if (resource.type === 'home') continue;
    for (const mk of resource.matchKeys) {
      if (mk === courseRoot) continue;
      if (key === mk || key.startsWith(`${mk}/`)) {
        if (mk.length > bestLen) {
          bestLen = mk.length;
          best = resource;
        }
      }
    }
  }

  return best;
}

/** Map Canvas page-view asset metadata to a module resource when URL matching fails. */
export function findResourceForPageViewAsset(
  resources: CourseResource[],
  assetType: string | undefined,
  assetId: number | undefined,
  courseId: string,
): CourseResource | undefined {
  if (!assetType || assetId == null) return undefined;
  const normalized = assetType.toLowerCase();

  if (normalized.includes('assignment')) {
    return resources.find((r) => r.assignmentId === assetId);
  }
  if (normalized.includes('quiz')) {
    return resources.find((r) => r.quizId === assetId);
  }
  if (normalized.includes('discussion')) {
    return resources.find((r) => r.type === 'discussion' && r.contentId === assetId);
  }
  if (normalized.includes('file') || normalized.includes('attachment')) {
    return resources.find((r) => r.type === 'file' && r.contentId === assetId);
  }
  if (normalized.includes('wiki') || normalized.includes('page')) {
    return resources.find((r) => r.type === 'page' && r.contentId === assetId);
  }

  return undefined;
}
