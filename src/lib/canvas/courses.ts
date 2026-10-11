import { fetchAllPages } from './client';

type CanvasEnrollment = {
  type?: string;
  role?: string;
};

type CanvasCourse = {
  id: number;
  name?: string;
  course_code?: string;
  workflow_state?: string;
  enrollments?: CanvasEnrollment[];
  term?: { name?: string };
};

export type CourseOption = {
  id: number;
  name: string;
  courseCode: string;
  term: string | null;
};

const STAFF_TYPES = new Set([
  'teacher',
  'ta',
  'designer',
  'teacherenrollment',
  'taenrollment',
  'designerenrollment',
]);

/** Teacher, TA, Designer, and Course Admin. Student and observer enrollments do not qualify. */
function isStaffEnrollment(enrollment: CanvasEnrollment): boolean {
  const type = (enrollment.type ?? '').toLowerCase();
  const role = (enrollment.role ?? '').toLowerCase().replace(/[_-]+/g, ' ').replace(/\s+/g, ' ').trim();
  if (type === 'student' || type === 'studentenrollment' || role === 'student' || role === 'student enrollment') {
    return false;
  }
  if (type === 'observer' || type === 'observerenrollment' || role === 'observer' || role === 'observer enrollment') {
    return false;
  }
  if (STAFF_TYPES.has(type)) return true;
  return role === 'course admin';
}

export async function listTeachingCourses(): Promise<CourseOption[]> {
  const courses = await fetchAllPages<CanvasCourse>('/courses', {
    'enrollment_state[]': ['active', 'completed'],
    'state[]': ['available', 'completed'],
    'include[]': ['term'],
  });

  return courses
    .filter((course) => course.workflow_state === 'available' || course.workflow_state === 'completed')
    .filter((course) => (course.enrollments ?? []).some(isStaffEnrollment))
    .map((course) => ({
      id: course.id,
      name: course.name ?? `Course ${course.id}`,
      courseCode: course.course_code ?? String(course.id),
      term: course.term?.name?.trim() || null,
    }))
    .sort((a, b) => a.name.localeCompare(b.name) || (a.term ?? '').localeCompare(b.term ?? ''));
}
