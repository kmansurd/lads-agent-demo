import { NextResponse } from 'next/server';
import { getCourseStudents } from '@/lib/canvas/students';
import { handleRouteError } from '@/lib/api/errors';
import { withCanvasRoute } from '@/lib/api/withCanvasRoute';

export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ courseId: string }> };

export async function GET(request: Request, { params }: Params) {
  return withCanvasRoute(request, async () => {
    try {
      const { courseId } = await params;
      const url = new URL(request.url);
      const payload = await getCourseStudents(courseId, {
        start: url.searchParams.get('start'),
        end: url.searchParams.get('end'),
      });
      return NextResponse.json({
        ...payload,
        dataSources: [
          'GET /courses/:id/users',
          'GET /courses/:id/enrollments',
          'GET /courses/:id/analytics/student_summaries',
          'GET /courses/:id/analytics/users/:student_id/activity (hourly page views in range)',
        ],
      });
    } catch (error) {
      return handleRouteError(error);
    }
  });
}
