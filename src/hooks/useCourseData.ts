'use client';

import { useCallback, useEffect, useState } from 'react';
import { useCourse } from '@/context/CourseContext';

export function useCourseData<T>(path: string | null) {
  const { courseId } = useCourse();
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!courseId || !path) {
      setData(null);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/courses/${courseId}/${path}`);
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? 'Request failed');
      setData(body as T);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Request failed');
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [courseId, path]);

  useEffect(() => {
    load();
  }, [load]);

  return { data, loading, error, reload: load, courseId };
}
