import { CanvasApiError, canvasRequest } from './client';

export type AccessLevel = 'ok' | 'forbidden' | 'missing' | 'error';

export type AnalyticsCapabilityLevel = 'available' | 'partial' | 'unavailable';

export type CourseCapabilities = {
  checkedAt: string;
  analytics: {
    level: AnalyticsCapabilityLevel;
    activity: AccessLevel;
    studentSummaries: AccessLevel;
    assignmentAnalytics: AccessLevel;
  };
  gradebook: {
    level: 'available' | 'unavailable';
    enrollments: AccessLevel;
    assignments: AccessLevel;
  };
  discussions: AccessLevel;
  permissions: {
    viewStatistics: boolean;
  };
  tabNotes: {
    gradebook: string;
    engagement: string;
    students: string;
    discussions: string;
  };
};

async function probeEndpoint(
  path: string,
  searchParams?: Record<string, string>,
): Promise<AccessLevel> {
  try {
    await canvasRequest<unknown>(path, searchParams);
    return 'ok';
  } catch (err) {
    if (err instanceof CanvasApiError) {
      if (err.status === 403) return 'forbidden';
      if (err.status === 404) return 'missing';
    }
    return 'error';
  }
}

function analyticsLevel(
  activity: AccessLevel,
  studentSummaries: AccessLevel,
  assignmentAnalytics: AccessLevel,
): AnalyticsCapabilityLevel {
  const flags = [activity, studentSummaries, assignmentAnalytics];
  const okCount = flags.filter((f) => f === 'ok').length;
  if (okCount === 0) return 'unavailable';
  if (okCount === flags.length) return 'available';
  return 'partial';
}

function labelAccess(level: AccessLevel): string {
  switch (level) {
    case 'ok':
      return 'available';
    case 'forbidden':
      return 'forbidden';
    case 'missing':
      return 'not found';
    default:
      return 'unavailable';
  }
}

function buildTabNotes(
  analytics: CourseCapabilities['analytics'],
  gradebook: CourseCapabilities['gradebook'],
  discussions: AccessLevel,
): CourseCapabilities['tabNotes'] {
  const engagementParts: string[] = [];
  if (analytics.activity === 'ok') {
    engagementParts.push('weekly chart from analytics/activity');
  } else {
    engagementParts.push(`activity API ${labelAccess(analytics.activity)}`);
  }
  if (analytics.assignmentAnalytics === 'ok') {
    engagementParts.push('assignment table from analytics/assignments');
  } else {
    engagementParts.push(`assignment analytics ${labelAccess(analytics.assignmentAnalytics)}`);
  }
  engagementParts.push(
    'per-item page views from page-view logs when Statistics permission is enabled, else analytics participation URLs',
  );

  const studentsParts: string[] = ['roster and grades from enrollments'];
  if (analytics.studentSummaries === 'ok') {
    studentsParts.push(
      'course totals from analytics/student_summaries; period page views, active days, and quiet stretches from analytics/users/:id/activity hourly buckets',
    );
  } else {
    studentsParts.push(
      `Canvas student analytics ${labelAccess(analytics.studentSummaries)} — engagement columns may be empty`,
    );
  }

  const gradebookOk =
    gradebook.enrollments === 'ok' && gradebook.assignments === 'ok';
  const gradebookNote = gradebookOk
    ? 'Gradebook data uses enrollments, assignments, and submissions. A selected assignment shows criterion marks and the posted score beside the rubric total. Rubric ratings can be matched to letter grades or percentage ranges. The assessment table follows that match, and the overall chart weights those assignment results by the weighting column. Quiz rubrics are read when the assignment submission has no criterion marks.'
    : 'Some gradebook APIs are unavailable — charts may be incomplete.';

  const discussionsNote =
    discussions === 'ok'
      ? 'Course-wide posts come from course discussion threads. When the course has groups, the Groups tab loads that group’s discussion threads. Idea connections are an epistemic network analysis of the posts in view.'
      : `Discussions API ${labelAccess(discussions)}.`;

  return {
    gradebook: gradebookNote,
    engagement: `Engagement tab: ${engagementParts.join('; ')}.`,
    students: `Students tab: ${studentsParts.join('; ')}.`,
    discussions: discussionsNote,
  };
}

export async function getCourseCapabilities(courseId: string): Promise<CourseCapabilities> {
  const [
    activity,
    studentSummaries,
    assignmentAnalytics,
    enrollments,
    assignments,
    discussions,
    permissions,
  ] = await Promise.all([
    probeEndpoint(`/courses/${courseId}/analytics/activity`),
    probeEndpoint(`/courses/${courseId}/analytics/student_summaries`, { per_page: '1' }),
    probeEndpoint(`/courses/${courseId}/analytics/assignments`, { async: 'true', per_page: '1' }),
    probeEndpoint(`/courses/${courseId}/enrollments`, {
      'type[]': 'StudentEnrollment',
      per_page: '1',
    }),
    probeEndpoint(`/courses/${courseId}/assignments`, { per_page: '1' }),
    probeEndpoint(`/courses/${courseId}/discussion_topics`, { per_page: '1' }),
    canvasRequest<Record<string, boolean>>(`/courses/${courseId}/permissions`).catch(
      () => ({}) as Record<string, boolean>,
    ),
  ]);

  const analytics = {
    activity,
    studentSummaries,
    assignmentAnalytics,
    level: analyticsLevel(activity, studentSummaries, assignmentAnalytics),
  };

  const gradebook = {
    enrollments,
    assignments,
    level:
      enrollments === 'ok' && assignments === 'ok'
        ? ('available' as const)
        : ('unavailable' as const),
  };

  return {
    checkedAt: new Date().toISOString(),
    analytics,
    gradebook,
    discussions,
    permissions: {
      viewStatistics: permissions.view_statistics === true,
    },
    tabNotes: buildTabNotes(analytics, gradebook, discussions),
  };
}
