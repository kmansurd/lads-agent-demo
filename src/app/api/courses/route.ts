import { NextResponse } from 'next/server';
import { listTeachingCourses } from '@/lib/canvas/courses';
import { handleRouteError } from '@/lib/api/errors';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const courses = await listTeachingCourses();
    return NextResponse.json({ courses });
  } catch (error) {
    return handleRouteError(error);
  }
}
