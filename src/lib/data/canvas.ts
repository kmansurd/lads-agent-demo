/**
 * src/lib/data/canvas.ts
 *
 * Fetches live data from the Canvas REST API and transforms it into the exact
 * CourseAnalytics shape consumed by the four tab components.
 *
 * Endpoint → canvas-mcp reference:
 *   Activity          → src/canvas_mcp/tools/analytics.py  (get_course_analytics_activity)
 *   Student summaries → src/canvas_mcp/tools/analytics.py  (get_student_analytics)
 *   Assignment groups → src/canvas_mcp/tools/grades.py     (list_assignment_groups)
 *   Enrollments       → src/canvas_mcp/tools/courses.py    (list_students)
 *   Submissions       → src/canvas_mcp/tools/grades.py     (list_submissions)
 *   Discussions       → src/canvas_mcp/tools/discussions.py
 *
 * See https://github.com/vishalsachdev/canvas-mcp for the full tool reference.
 */

import { CanvasClient, CanvasDiscussionEntry } from '@/lib/canvas/client';
import { getCanvasConfig, classifyAssignmentGroup } from '@/lib/config';
import type {
  CourseAnalytics,
  StudentRecord,
  GradeDistribution,
  AssessmentsData,
  AssessmentRecord,
  WeeklyActivityData,
  DiscussionRecord,
  DiscussionNode,
  DiscussionLink,
} from '@/types/analytics';

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Convert a numeric score (0-100) to a letter grade. */
function scoreToLetter(score: number): 'A' | 'B' | 'C' | 'D' | 'F' {
  if (score >= 90) return 'A';
  if (score >= 80) return 'B';
  if (score >= 70) return 'C';
  if (score >= 60) return 'D';
  return 'F';
}

/**
 * Group daily Canvas activity entries by ISO week and sum views/participations.
 * Returns labels like "Week 1", "Week 2", … in chronological order.
 */
function aggregateActivityByWeek(
  entries: { date: string; views: number; participations: number }[]
): WeeklyActivityData {
  const empty: WeeklyActivityData = {
    labels: [],
    datasets: [
      { label: 'Page Views', data: [], fill: false, borderColor: 'rgb(75, 192, 192)', tension: 0.1 },
      { label: 'Participations', data: [], fill: false, borderColor: 'rgb(255, 99, 132)', tension: 0.1 },
    ],
  };
  if (!entries.length) return empty;

  const sorted = [...entries].sort((a, b) => a.date.localeCompare(b.date));

  const firstDate = new Date(sorted[0].date);
  const dow = firstDate.getUTCDay();
  const offsetToMonday = dow === 0 ? -6 : 1 - dow;
  const firstMonday = new Date(firstDate);
  firstMonday.setUTCDate(firstDate.getUTCDate() + offsetToMonday);
  firstMonday.setUTCHours(0, 0, 0, 0);

  const weekMap = new Map<number, { views: number; participations: number }>();
  for (const entry of sorted) {
    const d = new Date(entry.date);
    const weekNum = Math.floor((d.getTime() - firstMonday.getTime()) / (7 * 86400000)) + 1;
    const cur = weekMap.get(weekNum) ?? { views: 0, participations: 0 };
    weekMap.set(weekNum, {
      views: cur.views + (entry.views ?? 0),
      participations: cur.participations + (entry.participations ?? 0),
    });
  }

  const weeks = Array.from(weekMap.entries()).sort((a, b) => a[0] - b[0]);
  return {
    labels: weeks.map(([n]) => `Week ${n}`),
    datasets: [
      { label: 'Page Views', data: weeks.map(([, v]) => v.views), fill: false, borderColor: 'rgb(75, 192, 192)', tension: 0.1 },
      { label: 'Participations', data: weeks.map(([, v]) => v.participations), fill: false, borderColor: 'rgb(255, 99, 132)', tension: 0.1 },
    ],
  };
}

/**
 * Flatten a Canvas discussion view (nested replies) into a flat list.
 */
function flattenEntries(entries: CanvasDiscussionEntry[]): CanvasDiscussionEntry[] {
  const result: CanvasDiscussionEntry[] = [];
  function walk(list: CanvasDiscussionEntry[]) {
    for (const e of list) {
      result.push(e);
      if (e.replies?.length) walk(e.replies);
    }
  }
  walk(entries);
  return result;
}

/**
 * Build a force-graph {nodes, links} from flat Canvas discussion entries.
 * Node id = user_name.  A link is drawn from reply-author → parent-post-author.
 */
function buildDiscussionGraph(entries: CanvasDiscussionEntry[]): {
  nodes: DiscussionNode[];
  links: DiscussionLink[];
} {
  const byId = new Map<number, CanvasDiscussionEntry>();
  for (const e of entries) byId.set(e.id, e);

  const userStats = new Map<string, { posts: number; replies: number; postsContent: string[] }>();
  const pairCount = new Map<string, number>();

  function ensureUser(name: string) {
    if (!userStats.has(name)) userStats.set(name, { posts: 0, replies: 0, postsContent: [] });
    return userStats.get(name)!;
  }

  for (const entry of entries) {
    const authorName = entry.user_name ?? `User ${entry.user_id}`;
    const stats = ensureUser(authorName);
    const content = entry.message ? entry.message.replace(/<[^>]+>/g, '').trim().slice(0, 120) : '';
    if (entry.parent_id) {
      stats.replies += 1;
      const parent = byId.get(entry.parent_id);
      if (parent) {
        const parentName = parent.user_name ?? `User ${parent.user_id}`;
        ensureUser(parentName);
        const key = `${authorName}::${parentName}`;
        pairCount.set(key, (pairCount.get(key) ?? 0) + 1);
      }
    } else {
      stats.posts += 1;
      if (content) stats.postsContent.push(content);
    }
  }

  function groupFor(name: string): number {
    let h = 0;
    for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) & 0xffff;
    return (h % 10) + 1;
  }

  const nodes: DiscussionNode[] = Array.from(userStats.entries()).map(([name, s]) => ({
    id: name, name, posts: s.posts, replies: s.replies, group: groupFor(name), postsContent: s.postsContent,
  }));
  const links: DiscussionLink[] = Array.from(pairCount.entries()).map(([key, value]) => {
    const [source, target] = key.split('::');
    return { source, target, value };
  });

  return { nodes, links };
}

// ─── Main export ──────────────────────────────────────────────────────────────

export async function getCanvasCourseAnalytics(): Promise<CourseAnalytics> {
  const { courseId } = getCanvasConfig();
  const client = CanvasClient.fromEnv();

  // Fetch everything in parallel — mirrors canvas-mcp's async httpx pattern
  const [enrollments, assignmentGroups, activityEntries, studentSummaries, discussionTopics] =
    await Promise.all([
      client.getStudentEnrollments(courseId),
      client.getAssignmentGroups(courseId),
      client.getCourseActivity(courseId),
      client.getStudentSummaries(courseId),
      client.getDiscussionTopics(courseId),
    ]);

  // ── Students tab ──────────────────────────────────────────────────────────
  const summaryById = new Map(studentSummaries.map(s => [s.id, s]));

  const students: StudentRecord[] = enrollments
    .filter(e => e.user)
    .map((e, idx) => {
      const summary = summaryById.get(e.user_id);
      const score = e.grades?.current_score ?? e.grades?.final_score ?? 0;
      return {
        id: e.user_id ?? idx + 1,
        name: e.user?.name ?? `Student ${e.user_id}`,
        grade: Math.round(score),
        lastActivity: e.last_activity_at ? e.last_activity_at.slice(0, 10) : '—',
        pagesViewed: summary?.page_views ?? 0,
        participations: summary?.participations ?? 0,
      };
    });

  // ── Course Grade tab — distribution histogram ─────────────────────────────
  const letterCounts = { A: 0, B: 0, C: 0, D: 0, F: 0 };
  for (const e of enrollments) {
    const score = e.grades?.current_score ?? e.grades?.final_score;
    if (score != null) letterCounts[scoreToLetter(score)] += 1;
  }

  const grades: GradeDistribution = {
    labels: ['A', 'B', 'C', 'D', 'F'],
    datasets: [{
      label: 'Number of Students',
      data: [letterCounts.A, letterCounts.B, letterCounts.C, letterCounts.D, letterCounts.F],
      backgroundColor: 'rgba(75, 192, 192, 0.6)',
    }],
  };

  // Per-assignment grade breakdown (cap to first 10 graded assignments)
  const formativeAssessments: AssessmentRecord[] = [];
  const summativeAssessments: AssessmentRecord[] = [];
  const MAX_ASSIGNMENTS = 10;
  let fetched = 0;

  outer:
  for (const group of assignmentGroups) {
    const classification = classifyAssignmentGroup(group.name);
    for (const assignment of group.assignments ?? []) {
      if (fetched >= MAX_ASSIGNMENTS) break outer;
      if (!assignment.points_possible || assignment.points_possible === 0) continue;
      fetched += 1;

      const submissions = await client.getSubmissions(courseId, assignment.id);
      const gradeCounts = { A: 0, B: 0, C: 0, D: 0, F: 0 };
      for (const sub of submissions) {
        if (sub.score != null) {
          const pct = (sub.score / assignment.points_possible!) * 100;
          gradeCounts[scoreToLetter(pct)] += 1;
        }
      }

      const record: AssessmentRecord = {
        name: assignment.name,
        weighting: group.group_weight != null ? `${group.group_weight.toFixed(0)}%` : '—',
        grades: gradeCounts,
      };

      if (classification === 'formative') formativeAssessments.push(record);
      else summativeAssessments.push(record);
    }
  }

  const assessments: AssessmentsData = {
    formative: formativeAssessments,
    summative: summativeAssessments,
  };

  // ── Weekly Online Activity tab ─────────────────────────────────────────────
  const activity = aggregateActivityByWeek(activityEntries);

  // ── Discussions tab (cap to 10 topics) ────────────────────────────────────
  const discussions: DiscussionRecord[] = await Promise.all(
    discussionTopics.slice(0, 10).map(async (topic, idx) => {
      const rawEntries = await client.getDiscussionEntries(courseId, topic.id);
      const flat = flattenEntries(rawEntries);
      const { nodes, links } = buildDiscussionGraph(flat);
      const uniqueParticipants = new Set(flat.map(e => e.user_id)).size;
      return {
        id: topic.id,
        title: topic.title,
        participants: uniqueParticipants,
        summary: topic.message
          ? topic.message.replace(/<[^>]+>/g, '').trim().slice(0, 300)
          : `Discussion with ${uniqueParticipants} participant(s).`,
        graphData: { nodes, links },
      };
    })
  );

  return { courseId, source: 'canvas', students, grades, assessments, activity, discussions };
}

