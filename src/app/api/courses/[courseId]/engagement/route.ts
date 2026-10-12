import { NextResponse } from 'next/server';
import { getCourseEngagement } from '@/lib/canvas/engagement';
import { handleRouteError } from '@/lib/api/errors';
import { withCanvasRoute } from '@/lib/api/withCanvasRoute';

export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ courseId: string }> };

export async function GET(request: Request, { params }: Params) {
  return withCanvasRoute(request, async () => {
    try {
      const { courseId } = await params;
      const url = new URL(request.url);
      const start = url.searchParams.get('start');
      const end = url.searchParams.get('end');
      const contentOnly = url.searchParams.get('contentOnly') === '1';

      const data = await getCourseEngagement(courseId, { start, end, contentOnly });
      return NextResponse.json(data);
    } catch (error) {
      return handleRouteError(error);
    }
  });
}
