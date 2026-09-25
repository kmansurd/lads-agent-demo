import { fetchAllPages } from './client';

type CanvasCourse = {
  id: number;
  name?: string;
  course_code?: string;
  workflow_state?: string;
};

export type CourseOption = {
  id: number;
  name: string;
  courseCode: string;
};

export async function listTeachingCourses(): Promise<CourseOption[]> {
  const courses = await fetchAllPages<CanvasCourse>('/courses', {
    enrollment_state: 'active',
    include: ['total_scores'],
  });

  return courses
    .filter((c) => c.workflow_state === 'available' || c.workflow_state === 'unpublished')
    .map((c) => ({
      id: c.id,
      name: c.name ?? `Course ${c.id}`,
      courseCode: c.course_code ?? String(c.id),
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
}
