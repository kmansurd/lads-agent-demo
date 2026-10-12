'use client';

import { useCallback, useEffect, useState } from 'react';
import { useCourse } from '@/context/CourseContext';
import { useCanvasAuth } from '@/context/CanvasAuthContext';
import { fetchWithCanvasAuth } from '@/lib/client/canvasTokenStorage';

export type CourseDataQuery = Record<string, string | undefined>;

function buildPath(base: string, query?: CourseDataQuery): string {
  if (!query) return base;
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value != null && value !== '') params.set(key, value);
  }
  const qs = params.toString();
  return qs ? `${base}?${qs}` : base;
}

export function useCourseData<T>(path: string | null, query?: CourseDataQuery) {
  const { courseId } = useCourse();
  const { tokenRevision } = useCanvasAuth();
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fetchedAt, setFetchedAt] = useState<Date | null>(null);

  const queryKey = query ? JSON.stringify(query) : '';

  const load = useCallback(async () => {
    if (!courseId || !path) {
      setData(null);
      setFetchedAt(null);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const urlPath = buildPath(path, query);
      const res = await fetchWithCanvasAuth(`/api/courses/${courseId}/${urlPath}`);
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? 'Request failed');
      setData(body as T);
      setFetchedAt(new Date());
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Request failed');
      setData(null);
      setFetchedAt(null);
    } finally {
      setLoading(false);
    }
  }, [courseId, path, queryKey, tokenRevision]);

  useEffect(() => {
    load();
  }, [load]);

  return { data, loading, error, reload: load, courseId, fetchedAt };
}
