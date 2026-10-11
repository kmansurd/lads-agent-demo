'use client';

import { useCourse } from '@/context/CourseContext';

export function useCourseCapabilities() {
  const { capabilities, capabilitiesLoading, refreshCapabilities } = useCourse();
  return {
    capabilities,
    loading: capabilitiesLoading,
    reload: refreshCapabilities,
  };
}
