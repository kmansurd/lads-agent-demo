import { NextResponse } from 'next/server';
import { getDiscussionsBoard } from '@/lib/canvas/discussions';
import { handleRouteError } from '@/lib/api/errors';
import { withCanvasRoute } from '@/lib/api/withCanvasRoute';

export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ courseId: string }> };

export async function GET(request: Request, { params }: Params) {
  return withCanvasRoute(request, async () => {
    try {
      const { courseId } = await params;
      const board = await getDiscussionsBoard(courseId);
      return NextResponse.json({
        discussions: board.courseDiscussions,
        courseDiscussions: board.courseDiscussions,
        groups: board.groups,
        hasGroups: board.hasGroups,
        dataSources: [
          'GET /courses/:id/discussion_topics (course-wide threads)',
          'GET /courses/:id/groups',
          'GET /groups/:group_id/discussion_topics (group threads)',
        ],
      });
    } catch (error) {
      return handleRouteError(error);
    }
  });
}
