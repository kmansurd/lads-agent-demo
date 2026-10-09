import { NextResponse } from 'next/server';
import { getWeeklyActivity } from '@/lib/canvas/activity';
import { getCourseGrades } from '@/lib/canvas/grades';
import { listCourseDiscussions } from '@/lib/canvas/discussions';
import { getCourseStudents } from '@/lib/canvas/students';
import { handleRouteError } from '@/lib/api/errors';

export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ courseId: string }> };
type TabKey = 'grades' | 'activity' | 'students' | 'discussions';

export async function GET(request: Request, { params }: Params) {
  try {
    const { courseId } = await params;
    const tab = (new URL(request.url).searchParams.get('tab') ?? 'grades') as TabKey;

    if (tab === 'grades') {
      const grades = await getCourseGrades(courseId);
      const total = grades.distribution.counts.reduce((a, b) => a + b, 0);
      const [a, b, , d, f] = grades.distribution.counts;
      return NextResponse.json({
        summary: `Course grade distribution (${total} students with scores): ${a} earned A, ${b} earned B, ${d} earned D, ${f} earned F. Review assessments with heavy F counts (often missing submissions).`,
      });
    }

    if (tab === 'activity') {
      const { chart } = await getWeeklyActivity(courseId);
      const peak = chart.pageViews.indexOf(Math.max(...chart.pageViews));
      const latest = chart.participations.at(-1) ?? 0;
      const prev = chart.participations.at(-2) ?? 0;
      const trend =
        latest >= prev ? 'stable or rising' : 'declining';
      return NextResponse.json({
        summary: `Weekly engagement peaks around ${chart.labels[peak] ?? 'mid-term'} (${chart.note}). Recent participation trend looks ${trend} compared to the prior week.`,
      });
    }

    if (tab === 'students') {
      const students = await getCourseStudents(courseId);
      const withGrades = students.filter((s) => s.grade != null);
      const atRisk = withGrades.filter((s) => (s.grade ?? 100) < 70);
      const engaged = [...students].sort((a, b) => b.participations - a.participations)[0];
      return NextResponse.json({
        summary: `${students.length} students on the roster; ${atRisk.length} below 70%. Highest participation: ${engaged?.name ?? 'n/a'} (${engaged?.participations ?? 0} participations, ${engaged?.pagesViewed ?? 0} page views in Canvas analytics).`,
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
