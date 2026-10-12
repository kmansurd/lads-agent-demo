import { NextResponse } from 'next/server';
import { getGroupTopicDetail, listGroupDiscussions } from '@/lib/canvas/discussions';
import { handleRouteError } from '@/lib/api/errors';
import { withCanvasRoute } from '@/lib/api/withCanvasRoute';

export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ courseId: string }> };

export async function GET(request: Request, { params }: Params) {
  return withCanvasRoute(request, async () => {
    try {
      await params;
      const url = new URL(request.url);
      const groupId = Number(url.searchParams.get('groupId'));
      if (!Number.isFinite(groupId)) {
        return NextResponse.json({ error: 'groupId is required' }, { status: 400 });
      }
      const topicId = url.searchParams.get('topicId');
      if (topicId) {
        const detail = await getGroupTopicDetail(groupId, topicId);
        return NextResponse.json(detail);
      }
      const discussions = await listGroupDiscussions(groupId);
      return NextResponse.json({ discussions });
    } catch (error) {
      return handleRouteError(error);
    }
  });
}
