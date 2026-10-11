import { NextResponse } from 'next/server';
import { getCourseCapabilities } from '@/lib/canvas/capabilities';
import { handleRouteError } from '@/lib/api/errors';

export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ courseId: string }> };

export async function GET(_request: Request, { params }: Params) {
  try {
    const { courseId } = await params;
    const data = await getCourseCapabilities(courseId);
    return NextResponse.json(data);
  } catch (error) {
    return handleRouteError(error);
  }
}
