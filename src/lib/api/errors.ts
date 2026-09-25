import { NextResponse } from 'next/server';
import { CanvasApiError } from '@/lib/canvas/client';

export function handleRouteError(error: unknown) {
  if (error instanceof CanvasApiError) {
    return NextResponse.json(
      { error: error.message },
      { status: error.status >= 400 && error.status < 600 ? error.status : 502 },
    );
  }
  console.error(error);
  return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
}
