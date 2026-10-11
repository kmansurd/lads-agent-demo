import type { CourseContentRow } from './courseContentCatalog';

export function pathKey(pathname: string): string {
  try {
    const u = new URL(pathname, 'https://canvas.local');
    return u.pathname.replace(/\/+$/, '').toLowerCase();
  } catch {
    return pathname.replace(/\/+$/, '').toLowerCase();
  }
}

/** Normalize analytics participation URLs (API paths, /submissions suffix). */
export function normalizeActivityUrl(url: string, courseId: string): string {
  try {
    const u = new URL(url);
    let pathname = u.pathname.replace(/\/+$/, '');
    pathname = pathname.replace(/\/submissions$/, '');

    const apiRest = pathname.match(/^\/api\/v\d+\/courses\/(\d+)\/(.+)$/i);
    if (apiRest) {
      pathname = `/courses/${apiRest[1]}/${apiRest[2]}`;
    }

    const ltiScores = pathname.match(
      /^\/api\/lti\/courses\/(\d+)\/line_items\/(\d+)\/scores$/i,
    );
    if (ltiScores) {
      pathname = `/courses/${ltiScores[1]}/line_items/${ltiScores[2]}`;
    }

    if (!pathname.includes(`/courses/${courseId}`)) {
      return url;
    }

    return `https://canvas.local${pathname}`;
  } catch {
    return url;
  }
}

export function buildContentMatchKeys(
  courseId: string,
  kind: CourseContentRow['type'],
  canvasId: number,
  extras?: { pageSlug?: string; htmlUrl?: string },
): string[] {
  const keys = new Set<string>();
  const cid = courseId;

  switch (kind) {
    case 'assignment':
      keys.add(pathKey(`/courses/${cid}/assignments/${canvasId}`));
      break;
    case 'quiz':
      keys.add(pathKey(`/courses/${cid}/quizzes/${canvasId}`));
      keys.add(pathKey(`/courses/${cid}/quizzes/${canvasId}/take`));
      break;
    case 'page':
      if (extras?.pageSlug) {
        keys.add(pathKey(`/courses/${cid}/pages/${extras.pageSlug}`));
      }
      keys.add(pathKey(`/courses/${cid}/pages/${canvasId}`));
      break;
    case 'discussion':
      keys.add(pathKey(`/courses/${cid}/discussion_topics/${canvasId}`));
      break;
    case 'file':
      keys.add(pathKey(`/courses/${cid}/files/${canvasId}`));
      break;
    default:
      break;
  }

  if (extras?.htmlUrl) {
    try {
      keys.add(pathKey(new URL(extras.htmlUrl).pathname));
    } catch {
      keys.add(pathKey(extras.htmlUrl));
    }
  }

  return [...keys];
}

export function findContentRowForUrl(
  content: CourseContentRow[],
  url: string,
  courseId: string,
): CourseContentRow | undefined {
  let key: string;
  try {
    key = pathKey(new URL(url).pathname);
  } catch {
    key = pathKey(url);
  }

  if (!key.includes(`/courses/${courseId}`)) return undefined;

  const courseRoot = pathKey(`/courses/${courseId}`);
  if (key === courseRoot) {
    return content.find((r) => r.type === 'page' && r.title.toLowerCase().includes('home'));
  }

  let best: CourseContentRow | undefined;
  let bestLen = 0;

  for (const row of content) {
    for (const mk of row.matchKeys) {
      if (mk === courseRoot) continue;
      if (key === mk || key.startsWith(`${mk}/`)) {
        if (mk.length > bestLen) {
          bestLen = mk.length;
          best = row;
        }
      }
    }
  }

  return best;
}
