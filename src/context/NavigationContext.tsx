'use client';

import React, { createContext, useCallback, useContext, useMemo, useState } from 'react';

export type CourseView = 'overview' | 'grades' | 'engagement' | 'students' | 'discussions';

export const DETAIL_VIEWS: { id: CourseView; label: string }[] = [
  { id: 'grades', label: 'Gradebook' },
  { id: 'engagement', label: 'Engagement' },
  { id: 'students', label: 'Students' },
  { id: 'discussions', label: 'Discussions' },
];

export function viewLabel(view: CourseView): string {
  if (view === 'overview') return 'Overview';
  return DETAIL_VIEWS.find((v) => v.id === view)?.label ?? 'Overview';
}

type NavigationContextValue = {
  view: CourseView;
  setView: (view: CourseView) => void;
};

const NavigationContext = createContext<NavigationContextValue | null>(null);

export function NavigationProvider({ children }: { children: React.ReactNode }) {
  const [view, setViewState] = useState<CourseView>('overview');

  const setView = useCallback((next: CourseView) => {
    setViewState(next);
  }, []);

  const value = useMemo(() => ({ view, setView }), [view, setView]);

  return <NavigationContext.Provider value={value}>{children}</NavigationContext.Provider>;
}

export function useNavigation() {
  const ctx = useContext(NavigationContext);
  if (!ctx) {
    throw new Error('useNavigation must be used within NavigationProvider');
  }
  return ctx;
}
