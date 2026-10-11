'use client';
import React, { useEffect, useMemo, useState } from 'react';
import { Bar } from 'react-chartjs-2';
import { Chart as ChartJS, CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend } from 'chart.js';
import {
  Box,
  Typography,
  Alert,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Card,
  CardContent,
  Grid,
} from '@mui/material';
import { useCourseData } from '@/hooks/useCourseData';
import { useCourse } from '@/context/CourseContext';
import { TabLoader } from '@/components/CourseDataState';
import { TabDataSourceFooter } from '@/components/TabDataSourceFooter';
import { useCourseCapabilities } from '@/hooks/useCourseCapabilities';
import { AssignmentRubricPanel } from '@/components/AssignmentRubricPanel';
import { AssessmentGradeTable } from '@/components/AssessmentGradeTable';
import { RubricRatingMap } from '@/components/RubricRatingMap';
import type { CourseGradesPayload, GradebookRating } from '@/lib/canvas/grades';
import type { AssignmentRubricDetail } from '@/lib/canvas/assignmentRubric';
import type { LetterBucket } from '@/lib/canvas/letterScale';
import { assessmentsForGradebook } from '@/lib/canvas/assessmentDisplay';
import {
  LETTERS,
  assignmentUsesMatch,
  binScores,
  collectRanges,
  courseCriteria,
  emptyMatch,
  letterColumnCounts,
  mappingRatings,
  overallLetterCounts,
  overallPercentCounts,
  percentColumnCounts,
  ratingIdentityKey,
  type GradeScale,
  type RatingMatchMap,
} from '@/lib/canvas/rubricMapping';

ChartJS.register(CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend);

const OVERALL_CHART_VALUE = 'overall';
const MATCH_STORAGE_PREFIX = 'lads-gradebook-rating-map:';

function readStoredMatch(courseId: string): {
  scale: GradeScale;
  matches: RatingMatchMap;
  hiddenKeys: string[];
  addedRatings: GradebookRating[];
} | null {
  try {
    const raw = localStorage.getItem(MATCH_STORAGE_PREFIX + courseId);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as {
      scale?: string;
      matches?: RatingMatchMap;
      hiddenKeys?: unknown;
      addedRatings?: unknown;
    };
    const scale: GradeScale = parsed.scale === 'percent' ? 'percent' : 'letter';
    const matches: RatingMatchMap = {};
    for (const [key, value] of Object.entries(parsed.matches ?? {})) {
      if (!value || typeof value !== 'object') continue;
      const letter = LETTERS.includes(value.letter as LetterBucket) ? (value.letter as LetterBucket) : '';
      matches[key] = {
        letter,
        start: typeof value.start === 'string' ? value.start : '',
        end: typeof value.end === 'string' ? value.end : '',
      };
    }
    const hiddenKeys = Array.isArray(parsed.hiddenKeys)
      ? parsed.hiddenKeys.filter((key): key is string => typeof key === 'string' && key.length > 0)
      : [];
    const addedRatings = Array.isArray(parsed.addedRatings)
      ? parsed.addedRatings.flatMap((item) => {
          if (!item || typeof item !== 'object') return [];
          const label = typeof (item as { label?: unknown }).label === 'string' ? (item as { label: string }).label.trim() : '';
          const key = ratingIdentityKey(label);
          if (!key) return [];
          return [{ key, label, points: null }];
        })
      : [];
    for (const key of hiddenKeys) delete matches[key];
    return { scale, matches, hiddenKeys, addedRatings };
  } catch {
    return null;
  }
}

const CourseGrade = () => {
  const { courseId } = useCourse();
  const { data, loading, error, fetchedAt } = useCourseData<CourseGradesPayload>('grades');
  const { capabilities } = useCourseCapabilities();
  const [chartSelection, setChartSelection] = useState<string>(OVERALL_CHART_VALUE);
  const [rubricDetail, setRubricDetail] = useState<AssignmentRubricDetail | null>(null);
  const [rubricLoading, setRubricLoading] = useState(false);
  const [scale, setScale] = useState<GradeScale>('letter');
  const [matches, setMatches] = useState<RatingMatchMap>({});
  const [hiddenKeys, setHiddenKeys] = useState<string[]>([]);
  const [addedRatings, setAddedRatings] = useState<GradebookRating[]>([]);
  const [matchReady, setMatchReady] = useState(false);

  const assessments = useMemo(
    () =>
      assessmentsForGradebook(data?.assessments ?? []).map((row) => ({
        ...row,
        criteria: row.criteria ?? [],
        outcomes: row.outcomes ?? [],
      })),
    [data?.assessments],
  );
  const criteria = useMemo(() => courseCriteria(assessments), [assessments]);
  const ratings = useMemo(() => {
    const hidden = new Set(hiddenKeys);
    const source = mappingRatings(criteria).filter((rating) => !hidden.has(rating.key));
    const known = new Set(source.map((rating) => rating.key));
    const extra = addedRatings.filter((rating) => !hidden.has(rating.key) && !known.has(rating.key));
    return [...source, ...extra];
  }, [addedRatings, criteria, hiddenKeys]);
  const ranges = useMemo(() => collectRanges(matches), [matches]);

  useEffect(() => {
    if (!courseId) return;
    const stored = readStoredMatch(courseId);
    setScale(stored?.scale ?? 'letter');
    setMatches(stored?.matches ?? {});
    setHiddenKeys(stored?.hiddenKeys ?? []);
    setAddedRatings(stored?.addedRatings ?? []);
    setMatchReady(true);
  }, [courseId]);

  useEffect(() => {
    if (!courseId || !matchReady) return;
    localStorage.setItem(
      MATCH_STORAGE_PREFIX + courseId,
      JSON.stringify({ scale, matches, hiddenKeys, addedRatings }),
    );
  }, [addedRatings, courseId, hiddenKeys, matchReady, matches, scale]);

  useEffect(() => {
    if (chartSelection === OVERALL_CHART_VALUE) return;
    if (!assessments.some((a) => String(a.id) === chartSelection)) {
      setChartSelection(OVERALL_CHART_VALUE);
    }
  }, [assessments, chartSelection]);

  useEffect(() => {
    if (!courseId || chartSelection === OVERALL_CHART_VALUE) {
      setRubricDetail(null);
      setRubricLoading(false);
      return;
    }
    let cancelled = false;
    setRubricDetail(null);
    setRubricLoading(true);
    fetch(`/api/courses/${courseId}/grades/assignments/${chartSelection}`)
      .then(async (res) => {
        const body = await res.json();
        if (!res.ok) throw new Error(body.error ?? 'Failed to load rubric');
        if (!cancelled) setRubricDetail(body as AssignmentRubricDetail);
      })
      .catch(() => {
        if (!cancelled) setRubricDetail(null);
      })
      .finally(() => {
        if (!cancelled) setRubricLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [courseId, chartSelection]);

  const selectedAssessment = useMemo(
    () => assessments.find((a) => String(a.id) === chartSelection),
    [assessments, chartSelection],
  );

  const overallLetters = useMemo(
    () => (scale === 'letter' ? overallLetterCounts(assessments, matches) : null),
    [assessments, matches, scale],
  );
  const overallPercents = useMemo(
    () => (scale === 'percent' ? overallPercentCounts(assessments, matches, ranges) : null),
    [assessments, matches, ranges, scale],
  );

  const chartModel = useMemo(() => {
    if (!data) return { labels: [] as string[], counts: [] as number[] };
    if (chartSelection === OVERALL_CHART_VALUE) {
      if (scale === 'percent') {
        return {
          labels: ranges.map((range) => range.label),
          counts: overallPercents?.counts ?? binScores(data.distribution.scores ?? [], ranges),
        };
      }
      return {
        labels: [...LETTERS],
        counts: overallLetters?.counts ?? data.distribution.counts,
      };
    }
    if (!selectedAssessment) return { labels: [] as string[], counts: [] as number[] };
    if (scale === 'percent') {
      return {
        labels: ranges.map((range) => range.label),
        counts: percentColumnCounts(selectedAssessment, matches, ranges).counts,
      };
    }
    return {
      labels: [...LETTERS],
      counts: letterColumnCounts(selectedAssessment, matches).counts,
    };
  }, [chartSelection, data, matches, overallLetters, overallPercents, ranges, scale, selectedAssessment]);

  const usingMatch =
    selectedAssessment != null && assignmentUsesMatch(selectedAssessment, matches, scale);

  const chartTitle =
    chartSelection === OVERALL_CHART_VALUE
      ? scale === 'percent'
        ? 'Grade distribution — Overall (weighted percentage from your ranges)'
        : 'Grade distribution — Overall (weighted letter from your match)'
      : `Grade distribution — ${selectedAssessment?.name ?? 'Assessment'}`;

  const chartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { position: 'top' as const },
      title: { display: true, text: chartTitle },
    },
  };

  if (loading || error) {
    return <TabLoader loading={loading} error={error} />;
  }

  if (!data) return null;

  const chartData = {
    labels: chartModel.labels,
    datasets: [
      {
        label: 'Students',
        data: chartModel.counts,
        backgroundColor: 'rgba(75, 192, 192, 0.6)',
        maxBarThickness: 64,
        categoryPercentage: 0.7,
        barPercentage: 0.85,
      },
    ],
  };

  const { kpi } = data;
  const selectedNotGraded =
    selectedAssessment == null
      ? 0
      : scale === 'percent'
        ? percentColumnCounts(selectedAssessment, matches, ranges).notGraded
        : letterColumnCounts(selectedAssessment, matches).notGraded;

  return (
    <Box sx={{ minWidth: 0, maxWidth: '100%' }}>
      <Grid container spacing={2} sx={{ mb: 3 }}>
        <Grid size={{ xs: 12, sm: 6, md: 3 }}>
          <Card variant="outlined">
            <CardContent>
              <Typography variant="overline" color="text.secondary">
                Enrolled
              </Typography>
              <Typography variant="h5">{kpi.studentsEnrolled}</Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid size={{ xs: 12, sm: 6, md: 3 }}>
          <Card variant="outlined">
            <CardContent>
              <Typography variant="overline" color="text.secondary">
                With current grade
              </Typography>
              <Typography variant="h5">
                {kpi.studentsWithGrade}
                {kpi.percentWithGrade != null ? (
                  <Typography component="span" variant="body2" color="text.secondary" sx={{ ml: 1 }}>
                    ({kpi.percentWithGrade}%)
                  </Typography>
                ) : null}
              </Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid size={{ xs: 12, sm: 6, md: 3 }}>
          <Card variant="outlined">
            <CardContent>
              <Typography variant="overline" color="text.secondary">
                Median score
              </Typography>
              <Typography variant="h5">
                {kpi.medianScore != null ? `${kpi.medianScore}%` : '—'}
              </Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid size={{ xs: 12, sm: 6, md: 3 }}>
          <Card variant="outlined">
            <CardContent>
              <Typography variant="overline" color="text.secondary">
                Assignments (missing &gt; submitted)
              </Typography>
              <Typography variant="h5">
                {
                  assessments.filter(
                    (row) => row.submissionStatus.missing > row.submissionStatus.submitted,
                  ).length
                }
              </Typography>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      <Alert severity="info" sx={{ mb: 2 }}>
        {chartSelection === OVERALL_CHART_VALUE ? (
          scale === 'percent' ? (
            <>
              Overall chart weights each student&apos;s assignment percentages by the weighting
              column, then places that score in the ranges you set. Rubric assignments use the
              matched ranges. {overallPercents?.graded ?? 0} students fall in a range
              {overallPercents && overallPercents.outside > 0
                ? `, and ${overallPercents.outside} fall outside them`
                : ''}
              .
            </>
          ) : (
            <>
              Overall chart weights each student&apos;s assignment letters by the weighting column.
              Rubric assignments use the letters you matched. Assignments that are not graded, or
              not in the final grade, are left out. {overallLetters?.graded ?? data.distribution.studentsWithGrade}{' '}
              students have a grade.
            </>
          )
        ) : usingMatch ? (
          scale === 'percent' ? (
            <>
              This chart counts students from the percentage ranges you matched to ratings.{' '}
              {selectedNotGraded} are outside those ranges or have no matched rating.
            </>
          ) : (
            <>
              This chart counts students from the letters you matched to ratings. A student with
              several ratings is counted under the points-weighted letter. {selectedNotGraded} not
              graded from that match.
            </>
          )
        ) : scale === 'percent' ? (
          <>
            {selectedAssessment?.usesRubric
              ? 'Match this assignment’s ratings to percentage ranges to plot them.'
              : 'This assignment has no rubric. Set percentage ranges above and the chart uses the posted score.'}{' '}
            {selectedNotGraded} not in a range yet.
          </>
        ) : (
          <>
            Assignment chart counts students with a <strong>clear posted grade</strong>.{' '}
            {selectedNotGraded} not graded. Match the ratings below to count rubric assignments from
            those ratings instead.
          </>
        )}
      </Alert>

      <FormControl size="small" sx={{ minWidth: 280, mb: 2 }}>
        <InputLabel id="grade-chart-assessment-label">Show distribution for</InputLabel>
        <Select
          labelId="grade-chart-assessment-label"
          value={chartSelection}
          label="Show distribution for"
          onChange={(e) => setChartSelection(e.target.value)}
        >
          <MenuItem value={OVERALL_CHART_VALUE}>Overall</MenuItem>
          {assessments.map((a) => (
            <MenuItem key={a.id} value={String(a.id)}>
              {a.name}
              {a.usesRubric ? ' (rubric)' : ''}
            </MenuItem>
          ))}
        </Select>
      </FormControl>

      <RubricRatingMap
        ratings={ratings}
        scale={scale}
        matches={matches}
        onScale={setScale}
        onMatch={(ratingKey, patch) => {
          setMatches((current) => ({
            ...current,
            [ratingKey]: { ...emptyMatch(), ...current[ratingKey], ...patch },
          }));
        }}
        onRemove={(ratingKey) => {
          setHiddenKeys((current) => (current.includes(ratingKey) ? current : [...current, ratingKey]));
          setAddedRatings((current) => current.filter((rating) => rating.key !== ratingKey));
          setMatches((current) => {
            if (!(ratingKey in current)) return current;
            const next = { ...current };
            delete next[ratingKey];
            return next;
          });
        }}
        onAdd={(label) => {
          const trimmed = label.replace(/\s+/g, ' ').trim();
          const key = ratingIdentityKey(trimmed);
          if (!key) return;
          setHiddenKeys((current) => current.filter((item) => item !== key));
          setAddedRatings((current) => {
            const fromCourse = mappingRatings(criteria).some((rating) => rating.key === key);
            if (fromCourse || current.some((rating) => rating.key === key)) return current;
            return [...current, { key, label: trimmed, points: null }];
          });
        }}
      />

      {chartModel.labels.length > 0 ? (
        <Box sx={{ position: 'relative', width: '100%', maxWidth: '100%', height: 360 }}>
          <Bar options={chartOptions} data={chartData} />
        </Box>
      ) : (
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          Set the start and end of a percentage range to see the chart.
        </Typography>
      )}
      {chartSelection !== OVERALL_CHART_VALUE ? (
        <AssignmentRubricPanel detail={rubricDetail} loading={rubricLoading} />
      ) : null}
      <Typography variant="caption" display="block" color="text.secondary" sx={{ mt: 1 }}>
        {data.weightingNote}
      </Typography>
      <AssessmentGradeTable
        rows={assessments}
        scale={scale}
        matches={matches}
        criteria={criteria}
        ranges={ranges}
      />
      <TabDataSourceFooter
        sources={data.dataSources}
        fetchedAt={fetchedAt}
        note={capabilities?.tabNotes.gradebook}
      />
    </Box>
  );
};

export default CourseGrade;
