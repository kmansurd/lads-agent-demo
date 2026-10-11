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
      const { content, dailyPattern, timeOfDay } = await getCourseEngagement(courseId);
      const published = content.filter((c) => c.published).length;
      return NextResponse.json({
        summary: `${dailyPattern.narrative} ${timeOfDay.narrative} ${content.length} course content items (${published} published).`,
      });
    }

    if (tab === 'students') {
      const { students } = await getCourseStudents(courseId, { includeActivity: true });
      const withGrades = students.filter((s) => s.grade != null);
      const atRisk = withGrades.filter((s) => (s.grade ?? 100) < 70);
      const highMissing = students.filter((s) => s.missingWorkLabel === 'High missing').length;
      const engaged = [...students].sort((a, b) => b.participations - a.participations)[0];
      const scanned = students.filter((s) => s.longestQuietDays != null);
      const quietest = [...scanned].sort(
        (a, b) => (b.longestQuietDays ?? 0) - (a.longestQuietDays ?? 0),
      )[0];
      const rates = scanned
        .map((s) => s.engagementRate)
        .filter((rate): rate is number => rate != null)
        .sort((a, b) => a - b);
      const medianRate = rates.length
        ? rates[Math.floor(rates.length / 2)]
        : null;
      const quietSentence = quietest
        ? ` Longest quiet stretch among scanned students: ${quietest.name}, ${quietest.longestQuietDays} days.`
        : '';
      const rateSentence =
        medianRate != null ? ` Median share of active days is ${medianRate}%.` : '';
      return NextResponse.json({
        summary: `${students.length} students on the roster; ${atRisk.length} below 70%; ${highMissing} flagged high missing work from analytics. Highest participation: ${engaged?.name ?? 'n/a'} (${engaged?.participations ?? 0} participations, ${engaged?.pagesViewedCourse ?? 0} course page views).${quietSentence}${rateSentence}`,
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
