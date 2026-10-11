import { NextResponse } from 'next/server';
import { listCourseDiscussions } from '@/lib/canvas/discussions';
import { handleRouteError } from '@/lib/api/errors';

export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ courseId: string }> };

export async function GET(_request: Request, { params }: Params) {
  try {
    const { courseId } = await params;
    const discussions = await listCourseDiscussions(courseId);
    return NextResponse.json({
      discussions,
      dataSources: [
        'GET /courses/:id/discussion_topics',
        'GET /courses/:id/discussion_topics/:topic_id/view (full posts and nested replies)',
      ],
    });
  } catch (error) {
    return handleRouteError(error);
  }
}
