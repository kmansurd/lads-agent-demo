import { NextResponse } from 'next/server';
import { getCourseEngagement } from '@/lib/canvas/engagement';
import { getCourseGrades } from '@/lib/canvas/grades';
import { listCourseDiscussions } from '@/lib/canvas/discussions';
import { getCourseStudents } from '@/lib/canvas/students';
import { handleRouteError } from '@/lib/api/errors';

export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ courseId: string }> };
type TabKey = 'grades' | 'engagement' | 'students' | 'discussions';

export async function GET(request: Request, { params }: Params) {
  try {
    const { courseId } = await params;
    const tab = (new URL(request.url).searchParams.get('tab') ?? 'grades') as TabKey;

    if (tab === 'grades') {
      const grades = await getCourseGrades(courseId);
      const total = grades.distribution.counts.reduce((a, b) => a + b, 0);
      const [a, b, , d, f] = grades.distribution.counts;
      const { kpi } = grades;
      const heavyMissing = grades.assessments.filter(
        (row) => row.submissionStatus.missing > row.submissionStatus.submitted,
      ).length;
      return NextResponse.json({
        summary: `${kpi.studentsEnrolled} students enrolled; ${kpi.percentWithGrade ?? 0}% have a current grade (median ${kpi.medianScore ?? 'n/a'}%). Letter buckets (${total} with A–F): ${a} A, ${b} B, ${d} D, ${f} F. ${heavyMissing} assignments have more missing than on-time submissions.`,
      });
    }

    if (tab === 'engagement') {
      const { chart, content } = await getCourseEngagement(courseId);
      const peak = chart.pageViews.length
        ? chart.pageViews.indexOf(Math.max(...chart.pageViews))
        : -1;
      const latest = chart.participations.at(-1) ?? 0;
      const prev = chart.participations.at(-2) ?? 0;
      const trend = latest >= prev ? 'stable or rising' : 'declining';
      const published = content.filter((c) => c.published).length;
      return NextResponse.json({
        summary: `Semester activity peaks around ${chart.labels[peak] ?? 'mid-term'}. Recent participation looks ${trend} vs the prior week. ${content.length} course content items (${published} published); assignment analytics attached where Canvas provides them.`,
      });
    }

    if (tab === 'students') {
      const students = await getCourseStudents(courseId);
      const withGrades = students.filter((s) => s.grade != null);
      const atRisk = withGrades.filter((s) => (s.grade ?? 100) < 70);
      const highMissing = students.filter((s) => s.missingWorkLabel === 'High missing').length;
      const engaged = [...students].sort((a, b) => b.participations - a.participations)[0];
      return NextResponse.json({
        summary: `${students.length} students on the roster; ${atRisk.length} below 70%; ${highMissing} flagged high missing work from analytics. Highest participation: ${engaged?.name ?? 'n/a'} (${engaged?.participations ?? 0} participations, ${engaged?.pagesViewed ?? 0} page views).`,
      });
    }

    const discussions = await listCourseDiscussions(courseId);
    const top = [...discussions].sort((a, b) => b.participants - a.participants)[0];
    return NextResponse.json({
      summary: `${discussions.length} discussion topics. Most active: "${top?.title ?? 'n/a'}" with ${top?.participants ?? 0} posts. Use the network view to spot students on the periphery.`,
    });
  } catch (error) {
    return handleRouteError(error);
  }
}
