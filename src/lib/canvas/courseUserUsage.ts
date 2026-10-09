import { CanvasApiError, fetchAllPages } from './client';
import { getCanvasConfig } from './config';
import type { CourseResource } from './courseResources';

export type CourseUsageRow = {
  asset_code?: string;
  asset_category?: string;
  display_name?: string;
  readable_name?: string;
  view_score?: number;
  participate_score?: number;
  asset_class_name?: string;
};

function canvasOrigin(): string {
  const config = getCanvasConfig();
  if (!config) return '';
  return config.baseUrl.replace(/\/api\/v1\/?$/i, '');
}

/**
 * Instructor-accessible access report (People → student → Access Report).
 * Requires course permission `read_reports`, not account `view_statistics`.
 */
export async function fetchCourseUserUsage(
  courseId: string,
  userId: number,
): Promise<CourseUsageRow[]> {
  const config = getCanvasConfig();
  if (!config) return [];

  const params = { per_page: '100' };
  const apiPath = `/courses/${courseId}/users/${userId}/usage`;

  try {
    return await fetchAllPages<CourseUsageRow>(apiPath, params);
  } catch (err) {
    if (!(err instanceof CanvasApiError) || err.status !== 404) {
      throw err;
    }
  }

  const origin = canvasOrigin();
  if (!origin) return [];

  const results: CourseUsageRow[] = [];
  let nextUrl: string | null =
    `${origin}/courses/${courseId}/users/${userId}/usage.json?per_page=100`;
  let pages = 0;

  while (nextUrl && pages < 50) {
    pages += 1;
    const response: Response = await fetch(nextUrl, {
      headers: {
        Authorization: `Bearer ${config.token}`,
        Accept: 'application/json',
        'User-Agent': 'lads-agent-demo/0.1 (Canvas REST BFF)',
      },
      cache: 'no-store',
    });
    if (!response.ok) {
      if (response.status === 403 || response.status === 404) return [];
      throw new CanvasApiError(await response.text(), response.status);
    }
    const chunk = (await response.json()) as CourseUsageRow[];
    results.push(...chunk);
    const link = response.headers.get('link');
    const match = link?.match(/<([^>]+)>;\s*rel="next"/);
    nextUrl = match?.[1] ?? null;
  }

  return results;
}

function isAggregateCourseAsset(assetCode: string | undefined): boolean {
  if (!assetCode) return true;
  const segment = assetCode.split(':').reverse()[0]?.trim() ?? assetCode;
  if (/^course_\d+$/i.test(segment)) return true;
  if (
    /^(assignments|pages|quizzes|modules|files|topics|home|grades|syllabus|roster)$/i.test(
      segment,
    )
  ) {
    return true;
  }
  return false;
}

export function extractAssetIdFromCode(
  assetCode: string | undefined,
): { kind: 'assignment' | 'page' | 'quiz' | 'discussion' | 'file'; id: number } | null {
  if (!assetCode || isAggregateCourseAsset(assetCode)) return null;

  const segment =
    assetCode
      .split(':')
      .map((s) => s.trim())
      .reverse()
      .find((s) => /\d/.test(s)) ?? assetCode;

  const patterns: { re: RegExp; kind: 'assignment' | 'page' | 'quiz' | 'discussion' | 'file' }[] =
    [
      { re: /^assignment_(\d+)$/i, kind: 'assignment' },
      { re: /^wiki_page_(\d+)$/i, kind: 'page' },
      { re: /^discussion_topic_(\d+)$/i, kind: 'discussion' },
      { re: /^attachment_(\d+)$/i, kind: 'file' },
      { re: /^quiz_(\d+)$/i, kind: 'quiz' },
      { re: /^quizzes?_(\d+)$/i, kind: 'quiz' },
    ];

  for (const { re, kind } of patterns) {
    const m = segment.match(re);
    if (m) return { kind, id: Number(m[1]) };
  }

  return null;
}

export function findResourceForUsageRow(
  resources: CourseResource[],
  row: CourseUsageRow,
): CourseResource | undefined {
  const parsed = extractAssetIdFromCode(row.asset_code);
  if (parsed) {
    switch (parsed.kind) {
      case 'assignment':
        return resources.find((r) => r.assignmentId === parsed.id);
      case 'quiz':
        return resources.find((r) => r.quizId === parsed.id);
      case 'page':
        return resources.find((r) => r.type === 'page' && r.contentId === parsed.id);
      case 'discussion':
        return resources.find((r) => r.type === 'discussion' && r.contentId === parsed.id);
      case 'file':
        return resources.find((r) => r.type === 'file' && r.contentId === parsed.id);
      default:
        break;
    }
  }

  const category = row.asset_category?.toLowerCase();
  if (category === 'home') {
    return resources.find((r) => r.type === 'home');
  }

  const label = (row.readable_name ?? row.display_name ?? '').trim().toLowerCase();
  if (!label) return undefined;

  const exact = resources.find((r) => r.title.trim().toLowerCase() === label);
  if (exact) return exact;

  return resources.find((r) => label.includes(r.title.trim().toLowerCase()));
}

export function usageViewCount(row: CourseUsageRow): number {
  const views = row.view_score ?? 0;
  const participates = row.participate_score ?? 0;
  const corrected = views - (row.asset_category === 'quizzes' ? participates : 0);
  return Math.max(0, Math.round(corrected));
}

export function usageParticipationCount(row: CourseUsageRow): number {
  return Math.max(0, Math.round(row.participate_score ?? 0));
}
