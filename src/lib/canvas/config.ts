const CANVAS_API_PATH = /^\/api\/v\d+\/?$/;

export type CanvasConfig = {
  baseUrl: string;
  token: string;
};

export function validateCanvasApiUrl(baseUrl: string): void {
  let url: URL;
  try {
    url = new URL(baseUrl);
  } catch {
    throw new Error(
      'CANVAS_API_URL must be a valid URL ending with /api/v1 (e.g. https://canvas.instructure.com/api/v1)',
    );
  }

  if (!CANVAS_API_PATH.test(url.pathname)) {
    throw new Error(
      'CANVAS_API_URL must end with /api/v1 (e.g. https://canvas.instructure.com/api/v1). Paths like /api/v without a version number are not valid.',
    );
  }
}

/** Header sent from the browser; never logged or persisted server-side. */
export const CANVAS_ACCESS_TOKEN_HEADER = 'X-Canvas-Access-Token';

export function resolveCanvasConfigFromRequest(request: Request): CanvasConfig | null {
  const baseUrl = process.env.CANVAS_API_URL?.replace(/\/$/, '');
  if (!baseUrl) {
    return null;
  }

  validateCanvasApiUrl(baseUrl);

  const headerToken = request.headers.get(CANVAS_ACCESS_TOKEN_HEADER)?.trim();
  const envToken = process.env.CANVAS_API_TOKEN?.trim();
  const token = headerToken || envToken;
  if (!token) {
    return null;
  }

  return { baseUrl, token };
}

export function getEnvCanvasConfig(): CanvasConfig | null {
  const baseUrl = process.env.CANVAS_API_URL?.replace(/\/$/, '');
  const token = process.env.CANVAS_API_TOKEN?.trim();

  if (!baseUrl || !token) {
    return null;
  }

  validateCanvasApiUrl(baseUrl);

  return { baseUrl, token };
}
