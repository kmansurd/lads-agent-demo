import { getCanvasConfig } from './config';

const MAX_PAGES = 50;
const USER_AGENT = 'lads-agent-demo/0.1 (Canvas REST BFF)';

export class CanvasApiError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
    this.name = 'CanvasApiError';
  }
}

function parseLinkHeader(link: string | null): string | null {
  if (!link) return null;
  const match = link.match(/<([^>]+)>;\s*rel="next"/);
  return match?.[1] ?? null;
}

export async function canvasRequest<T>(
  path: string,
  searchParams?: Record<string, string | string[] | undefined>,
): Promise<T> {
  const config = getCanvasConfig();
  if (!config) {
    throw new CanvasApiError(
      'Canvas is not configured. Set CANVAS_API_URL and CANVAS_API_TOKEN in .env.local',
      503,
    );
  }

  const url = new URL(
    path.startsWith('http') ? path : `${config.baseUrl}${path.startsWith('/') ? path : `/${path}`}`,
  );

  if (searchParams) {
    for (const [key, value] of Object.entries(searchParams)) {
      if (value === undefined) continue;
      if (Array.isArray(value)) {
        for (const v of value) url.searchParams.append(key, v);
      } else {
        url.searchParams.set(key, value);
      }
    }
  }

  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${config.token}`,
      Accept: 'application/json',
      'User-Agent': USER_AGENT,
    },
    cache: 'no-store',
  });

  if (!response.ok) {
    const body = await response.text().catch(() => '');
    throw new CanvasApiError(
      body || `Canvas API error ${response.status} for ${path}`,
      response.status,
    );
  }

  return response.json() as Promise<T>;
}

export async function fetchAllPages<T>(
  path: string,
  searchParams?: Record<string, string | string[] | undefined>,
): Promise<T[]> {
  const config = getCanvasConfig();
  if (!config) {
    throw new CanvasApiError(
      'Canvas is not configured. Set CANVAS_API_URL and CANVAS_API_TOKEN in .env.local',
      503,
    );
  }

  const results: T[] = [];
  let nextUrl: string | null = null;
  let pageCount = 0;

  const firstUrl = new URL(`${config.baseUrl}${path.startsWith('/') ? path : `/${path}`}`);
  if (searchParams) {
    for (const [key, value] of Object.entries(searchParams)) {
      if (value === undefined) continue;
      if (Array.isArray(value)) {
        for (const v of value) urlAppend(firstUrl, key, v);
      } else {
        firstUrl.searchParams.set(key, value);
      }
    }
  }
  if (!firstUrl.searchParams.has('per_page')) {
    firstUrl.searchParams.set('per_page', '100');
  }

  nextUrl = firstUrl.toString();

  while (nextUrl && pageCount < MAX_PAGES) {
    pageCount += 1;
    const configInner = getCanvasConfig();
    if (!configInner) break;

    const response = await fetch(nextUrl, {
      headers: {
        Authorization: `Bearer ${configInner.token}`,
        Accept: 'application/json',
        'User-Agent': USER_AGENT,
      },
      cache: 'no-store',
    });

    if (!response.ok) {
      const body = await response.text().catch(() => '');
      throw new CanvasApiError(body || `Canvas API error ${response.status}`, response.status);
    }

    const chunk = (await response.json()) as T[];
    results.push(...chunk);
    nextUrl = parseLinkHeader(response.headers.get('link'));
  }

  return results;
}

function urlAppend(url: URL, key: string, value: string) {
  url.searchParams.append(key, value);
}

export async function mapPool<T, R>(
  items: T[],
  concurrency: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  const results: R[] = [];
  let index = 0;

  async function worker() {
    while (index < items.length) {
      const i = index++;
      results[i] = await fn(items[i]);
    }
  }

  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, () => worker()));
  return results;
}
