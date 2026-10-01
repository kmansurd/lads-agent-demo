export interface StudentRecord {
  id: number;
  name: string;
  grade: number;
  lastActivity: string;
  pagesViewed: number;
  participations: number;
}

export interface GradeDistribution {
  labels: string[];
  datasets: Array<{
    label: string;
    data: number[];
    backgroundColor: string;
  }>;
}

export interface AssessmentGrades {
  A: number;
  B: number;
  C: number;
  D: number;
  F: number;
}

export interface AssessmentRecord {
  name: string;
  weighting: string;
  grades: AssessmentGrades;
}

export interface AssessmentsData {
  formative: AssessmentRecord[];
  summative: AssessmentRecord[];
}

export interface WeeklyActivityData {
  labels: string[];
  datasets: Array<{
    label: string;
    data: number[];
    fill: boolean;
    borderColor: string;
    tension: number;
  }>;
}

export interface DiscussionNode {
  id: string;
  name: string;
  posts: number;
  replies: number;
  group: number;
  postsContent?: string[];
}

export interface DiscussionLink {
  source: string;
  target: string;
  value: number;
}

export interface DiscussionGraphData {
  nodes: DiscussionNode[];
  links: DiscussionLink[];
}

export interface DiscussionRecord {
  id: number;
  title: string;
  participants: number;
  summary: string;
  graphData: DiscussionGraphData;
}

export interface CourseAnalytics {
  courseId: string;
  source: 'mock' | 'canvas';
  students: StudentRecord[];
  grades: GradeDistribution;
  assessments: AssessmentsData;
  activity: WeeklyActivityData;
  discussions: DiscussionRecord[];
}

export type AnalyticsTab = 'course-grade' | 'weekly-activity' | 'students' | 'discussions';

export const TAB_INDEX: Record<AnalyticsTab, number> = {
  'course-grade': 0,
  'weekly-activity': 1,
  students: 2,
  discussions: 3,
};

export const TAB_BY_INDEX: AnalyticsTab[] = [
  'course-grade',
  'weekly-activity',
  'students',
  'discussions',
];
