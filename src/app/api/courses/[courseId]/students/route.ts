import { NextResponse } from 'next/server';
import { getCourseStudents } from '@/lib/canvas/students';
import { handleRouteError } from '@/lib/api/errors';

export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ courseId: string }> };

export async function GET(_request: Request, { params }: Params) {
  try {
    const { courseId } = await params;
    const students = await getCourseStudents(courseId);
    return NextResponse.json({ students });
  } catch (error) {
    return handleRouteError(error);
  }
}
