import { NextResponse } from 'next/server';
import { listTeachingCourses } from '@/lib/canvas/courses';
import { handleRouteError } from '@/lib/api/errors';
import { withCanvasRoute } from '@/lib/api/withCanvasRoute';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  return withCanvasRoute(request, async () => {
    try {
      const courses = await listTeachingCourses();
      return NextResponse.json({ courses });
    } catch (error) {
      return handleRouteError(error);
    }
  });
}
