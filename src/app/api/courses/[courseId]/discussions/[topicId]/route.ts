import { NextResponse } from 'next/server';
import { getDiscussionDetail } from '@/lib/canvas/discussions';
import { handleRouteError } from '@/lib/api/errors';

export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ courseId: string; topicId: string }> };

export async function GET(_request: Request, { params }: Params) {
  try {
    const { courseId, topicId } = await params;
    const detail = await getDiscussionDetail(courseId, topicId);
    return NextResponse.json(detail);
  } catch (error) {
    return handleRouteError(error);
  }
}
