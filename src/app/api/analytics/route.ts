/**
 * GET /api/analytics
 *
 * Returns a CourseAnalytics JSON object for the configured course.
 * The Canvas API token is read from server-side env vars and is NEVER
 * included in the response — it stays server-side only.
 *
 * Cache: revalidated every 5 minutes so the UI isn't stale but we don't
 * hammer the Canvas API on every tab click.
 */

import { NextResponse } from 'next/server';
import { getCourseAnalytics } from '@/lib/data/index';

export const runtime = 'nodejs';
export const revalidate = 300; // 5 minutes

export async function GET() {
  try {
    const data = await getCourseAnalytics();
    return NextResponse.json(data);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[/api/analytics] error:', message);
    // Return a sanitised error — never leak the raw Canvas error body
    // (which could contain token info or internal Canvas URLs)
    return NextResponse.json(
      { error: 'Failed to load course analytics. Check server logs for details.' },
      { status: 500 }
    );
  }
}
