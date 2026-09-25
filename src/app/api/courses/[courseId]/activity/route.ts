import { NextResponse } from 'next/server';
import { getWeeklyActivity } from '@/lib/canvas/activity';
import { handleRouteError } from '@/lib/api/errors';

export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ courseId: string }> };

export async function GET(_request: Request, { params }: Params) {
  try {
    const { courseId } = await params;
    const data = await getWeeklyActivity(courseId);
    return NextResponse.json(data);
  } catch (error) {
    return handleRouteError(error);
  }
}
