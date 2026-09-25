'use client';

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';

export type CourseOption = {
  id: number;
  name: string;
  courseCode: string;
};

type CourseContextValue = {
  courses: CourseOption[];
  courseId: string | null;
  setCourseId: (id: string) => void;
  loading: boolean;
  error: string | null;
  refreshCourses: () => void;
};

const CourseContext = createContext<CourseContextValue | null>(null);

export function CourseProvider({ children }: { children: React.ReactNode }) {
  const [courses, setCourses] = useState<CourseOption[]>([]);
  const [courseId, setCourseIdState] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refreshCourses = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/courses');
      const body = await res.json();
      if (!res.ok) {
        throw new Error(body.error ?? 'Failed to load courses');
      }
      setCourses(body.courses ?? []);
      setCourseIdState((prev) => {
        if (prev && body.courses?.some((c: CourseOption) => String(c.id) === prev)) {
          return prev;
        }
        return body.courses?.[0] ? String(body.courses[0].id) : null;
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load courses');
      setCourses([]);
      setCourseIdState(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refreshCourses();
  }, [refreshCourses]);

  const setCourseId = useCallback((id: string) => {
    setCourseIdState(id);
  }, []);

  const value = useMemo(
    () => ({
      courses,
      courseId,
      setCourseId,
      loading,
      error,
      refreshCourses,
    }),
    [courses, courseId, setCourseId, loading, error, refreshCourses],
  );

  return <CourseContext.Provider value={value}>{children}</CourseContext.Provider>;
}

export function useCourse() {
  const ctx = useContext(CourseContext);
  if (!ctx) {
    throw new Error('useCourse must be used within CourseProvider');
  }
  return ctx;
}
