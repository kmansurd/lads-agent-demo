import { NextResponse } from 'next/server';
import { getAssignmentRubricDetail } from '@/lib/canvas/assignmentRubric';
import { handleRouteError } from '@/lib/api/errors';
import { withCanvasRoute } from '@/lib/api/withCanvasRoute';

export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ courseId: string; assignmentId: string }> };

export async function GET(request: Request, { params }: Params) {
  return withCanvasRoute(request, async () => {
    try {
      const { courseId, assignmentId } = await params;
      const detail = await getAssignmentRubricDetail(courseId, assignmentId);
      return NextResponse.json(detail);
    } catch (error) {
      return handleRouteError(error);
    }
  });
}
