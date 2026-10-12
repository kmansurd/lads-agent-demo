const STORAGE_KEY = 'lads.canvas.accessToken';

export function readStoredCanvasToken(): string {
  if (typeof window === 'undefined') return '';
  try {
    return localStorage.getItem(STORAGE_KEY)?.trim() ?? '';
  } catch {
    return '';
  }
}

export function writeStoredCanvasToken(token: string): void {
  if (typeof window === 'undefined') return;
  try {
    const trimmed = token.trim();
    if (trimmed) {
      localStorage.setItem(STORAGE_KEY, trimmed);
    } else {
      localStorage.removeItem(STORAGE_KEY);
    }
  } catch {
    // Private mode or blocked storage — token stays in session memory only.
  }
}

export function canvasAuthHeaders(): Record<string, string> {
  const token = readStoredCanvasToken();
  if (!token) return {};
  return { 'X-Canvas-Access-Token': token };
}

export function fetchWithCanvasAuth(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const headers = new Headers(init?.headers);
  for (const [key, value] of Object.entries(canvasAuthHeaders())) {
    headers.set(key, value);
  }
  return fetch(input, { ...init, headers });
}
