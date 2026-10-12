import { NextResponse } from 'next/server';
import { MissingCanvasAuthError, resolveAndRunCanvasRoute } from '@/lib/canvas/requestContext';
import { handleRouteError } from '@/lib/api/errors';

/**
 * Runs a route handler with Canvas credentials from the request header
 * (user token from the browser) or server env fallback. Tokens are never
 * written to disk or logged.
 */
export async function withCanvasRoute(
  request: Request,
  handler: () => Promise<Response> | Response,
): Promise<Response> {
  try {
    return await resolveAndRunCanvasRoute(request, async () => handler());
  } catch (error) {
    if (error instanceof MissingCanvasAuthError) {
      return NextResponse.json({ error: error.message }, { status: 401 });
    }
    return handleRouteError(error);
  }
}
