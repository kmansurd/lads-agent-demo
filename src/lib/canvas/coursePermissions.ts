import { canvasRequest } from './client';

export async function courseHasViewStatistics(courseId: string): Promise<boolean> {
  try {
    const perms = await canvasRequest<Record<string, boolean>>(
      `/courses/${courseId}/permissions`,
    );
    return perms.view_statistics === true;
  } catch {
    return false;
  }
}
