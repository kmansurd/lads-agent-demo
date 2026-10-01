import { studentsData } from '@/data/students';
import { gradesData } from '@/data/grades';
import { assessmentsData } from '@/data/assessments';
import { weeklyActivityData } from '@/data/activity';
import { discussionsData } from '@/data/discussions';
import type { CourseAnalytics } from '@/types/analytics';
import { getCourseId } from '@/lib/config';

export function getMockCourseAnalytics(): CourseAnalytics {
  return {
    courseId: getCourseId(),
    source: 'mock',
    students: studentsData,
    grades: gradesData,
    assessments: assessmentsData,
    activity: weeklyActivityData,
    discussions: discussionsData,
  };
}
