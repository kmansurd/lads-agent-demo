export function getCanvasConfig() {
  const baseUrl = process.env.CANVAS_API_URL?.replace(/\/$/, '');
  const token = process.env.CANVAS_API_TOKEN;

  if (!baseUrl || !token) {
    return null;
  }

  if (!baseUrl.includes('/api/v')) {
    throw new Error(
      'CANVAS_API_URL must include the /api/v1 path (e.g. https://canvas.instructure.com/api/v1)',
    );
  }

  return { baseUrl, token };
}
