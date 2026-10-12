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
import { fetchWithCanvasAuth } from '@/lib/client/canvasTokenStorage';
import { useCourse } from '@/context/CourseContext';
import { TabLoader } from '@/components/CourseDataState';
import { TabDataSourceFooter } from '@/components/TabDataSourceFooter';
import { useCourseCapabilities } from '@/hooks/useCourseCapabilities';
import { AssignmentRubricPanel } from '@/components/AssignmentRubricPanel';
import { AssessmentGradeTable } from '@/components/AssessmentGradeTable';
import { RubricRatingMap } from '@/components/RubricRatingMap';
import type { CourseGradesPayload, GradebookRating } from '@/lib/canvas/grades';
import { getChartSeries, barChartOptions } from '@/lib/chartDefaults';
import { useColorMode } from '@/context/ColorModeContext';
import { chartPanelSx } from '@/theme/appleTheme';
import type { AssignmentRubricDetail } from '@/lib/canvas/assignmentRubric';
import type { LetterBucket } from '@/lib/canvas/letterScale';
import { assessmentsForGradebook } from '@/lib/canvas/assessmentDisplay';
import {
  applyWeightOverrides,
  commitWeightDraft,
  manualWeightTotalValid,
  weightOverridesDirty,
  type AssessmentWeightOverrides,
} from '@/lib/canvas/assessmentWeights';
import {
  LETTERS,
  assignmentUsesMatch,
  binScores,
  collectRanges,
  courseCriteria,
  emptyMatch,
  letterColumnCounts,
  mappingRatings,
  orderGradebookRatings,
  reorderRatingKeys,
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
const WEIGHT_STORAGE_PREFIX = 'lads-gradebook-assessment-weights:';

function readStoredWeights(courseId: string): AssessmentWeightOverrides {
  try {
    const raw = localStorage.getItem(WEIGHT_STORAGE_PREFIX + courseId);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== 'object') return {};
    const overrides: AssessmentWeightOverrides = {};
    for (const [key, value] of Object.entries(parsed)) {
      if (typeof value === 'string') overrides[key] = value;
    }
    return overrides;
  } catch {
    return {};
  }
}

function readStoredMatch(courseId: string): {
  scale: GradeScale;
  matches: RatingMatchMap;
  hiddenKeys: string[];
  addedRatings: GradebookRating[];
  ratingOrderKeys: string[];
} | null {
  try {
    const raw = localStorage.getItem(MATCH_STORAGE_PREFIX + courseId);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as {
      scale?: string;
      matches?: RatingMatchMap;
      hiddenKeys?: unknown;
      addedRatings?: unknown;
      ratingOrder?: unknown;
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
    const ratingOrderKeys = Array.isArray(parsed.ratingOrder)
      ? parsed.ratingOrder.filter((key): key is string => typeof key === 'string' && key.length > 0)
      : [];
    for (const key of hiddenKeys) delete matches[key];
    return { scale, matches, hiddenKeys, addedRatings, ratingOrderKeys };
  } catch {
    return null;
  }
}

const CourseGrade = () => {
  const { courseId } = useCourse();
  const { data, loading, error, fetchedAt } = useCourseData<CourseGradesPayload>('grades');
  const { capabilities } = useCourseCapabilities();
  const { resolvedMode } = useColorMode();
  const chartSeries = getChartSeries(resolvedMode);
  const [chartSelection, setChartSelection] = useState<string>(OVERALL_CHART_VALUE);
  const [rubricDetail, setRubricDetail] = useState<AssignmentRubricDetail | null>(null);
  const [rubricLoading, setRubricLoading] = useState(false);
  const [scale, setScale] = useState<GradeScale>('letter');
  const [matches, setMatches] = useState<RatingMatchMap>({});
  const [hiddenKeys, setHiddenKeys] = useState<string[]>([]);
  const [addedRatings, setAddedRatings] = useState<GradebookRating[]>([]);
  const [ratingOrderKeys, setRatingOrderKeys] = useState<string[]>([]);
  const [matchReady, setMatchReady] = useState(false);
  const [weightOverrides, setWeightOverrides] = useState<AssessmentWeightOverrides>({});
  const [weightDraft, setWeightDraft] = useState<AssessmentWeightOverrides>({});
  const [weightsReady, setWeightsReady] = useState(false);
  const weightsDirty = useMemo(
    () => weightOverridesDirty(weightDraft, weightOverrides),
    [weightDraft, weightOverrides],
  );

  const assessments = useMemo(
    () =>
      assessmentsForGradebook(data?.assessments ?? []).map((row) => ({
        ...row,
        criteria: row.criteria ?? [],
        outcomes: row.outcomes ?? [],
      })),
    [data?.assessments],
  );
  const weightedAssessments = useMemo(
    () => applyWeightOverrides(assessments, weightOverrides),
    [assessments, weightOverrides],
  );
  const criteria = useMemo(() => courseCriteria(assessments), [assessments]);
  const baseRatings = useMemo(() => {
    const hidden = new Set(hiddenKeys);
    const source = mappingRatings(criteria).filter((rating) => !hidden.has(rating.key));
    const known = new Set(source.map((rating) => rating.key));
    const extra = addedRatings.filter((rating) => !hidden.has(rating.key) && !known.has(rating.key));
    return [...source, ...extra];
  }, [addedRatings, criteria, hiddenKeys]);
  const ratings = useMemo(
    () => orderGradebookRatings(baseRatings, ratingOrderKeys),
    [baseRatings, ratingOrderKeys],
  );

  useEffect(() => {
    const keys = baseRatings.map((rating) => rating.key);
    setRatingOrderKeys((prev) => {
      const kept = prev.filter((key) => keys.includes(key));
      const missing = keys.filter((key) => !kept.includes(key));
      if (missing.length === 0 && kept.length === prev.length) return prev;
      return [...kept, ...missing];
    });
  }, [baseRatings]);
  const ranges = useMemo(() => collectRanges(matches), [matches]);

  useEffect(() => {
    if (!courseId) return;
    const stored = readStoredMatch(courseId);
    setScale(stored?.scale ?? 'letter');
    setMatches(stored?.matches ?? {});
    setHiddenKeys(stored?.hiddenKeys ?? []);
    setAddedRatings(stored?.addedRatings ?? []);
    setRatingOrderKeys(stored?.ratingOrderKeys ?? []);
    setMatchReady(true);
    const storedWeights = readStoredWeights(courseId);
    setWeightOverrides(storedWeights);
    setWeightDraft(storedWeights);
    setWeightsReady(true);
  }, [courseId]);

  useEffect(() => {
    if (!courseId || !matchReady) return;
    localStorage.setItem(
      MATCH_STORAGE_PREFIX + courseId,
      JSON.stringify({ scale, matches, hiddenKeys, addedRatings, ratingOrder: ratingOrderKeys }),
    );
  }, [addedRatings, courseId, hiddenKeys, matchReady, matches, ratingOrderKeys, scale]);

  useEffect(() => {
    if (!courseId || !weightsReady) return;
    localStorage.setItem(WEIGHT_STORAGE_PREFIX + courseId, JSON.stringify(weightOverrides));
  }, [courseId, weightOverrides, weightsReady]);

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
    fetchWithCanvasAuth(`/api/courses/${courseId}/grades/assignments/${chartSelection}`)
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
    () => weightedAssessments.find((a) => String(a.id) === chartSelection),
    [chartSelection, weightedAssessments],
  );

  const overallLetters = useMemo(
    () => (scale === 'letter' ? overallLetterCounts(weightedAssessments, matches) : null),
    [matches, scale, weightedAssessments],
  );
  const overallPercents = useMemo(
    () => (scale === 'percent' ? overallPercentCounts(weightedAssessments, matches, ranges) : null),
    [matches, ranges, scale, weightedAssessments],
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

  const chartOptions = barChartOptions(chartTitle, resolvedMode);

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
        backgroundColor: `${chartSeries.primary}${resolvedMode === 'dark' ? 'e6' : 'cc'}`,
        borderRadius: 6,
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
        onMoveRating={(activeKey, targetKey) => {
          setRatingOrderKeys((current) =>
            reorderRatingKeys(
              orderGradebookRatings(baseRatings, current).map((rating) => rating.key),
              activeKey,
              targetKey,
            ),
          );
        }}
        onRemove={(ratingKey) => {
          setHiddenKeys((current) => (current.includes(ratingKey) ? current : [...current, ratingKey]));
          setAddedRatings((current) => current.filter((rating) => rating.key !== ratingKey));
          setRatingOrderKeys((current) => current.filter((key) => key !== ratingKey));
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
          setRatingOrderKeys((current) => (current.includes(key) ? current : [...current, key]));
        }}
      />

      {chartModel.labels.length > 0 ? (
        <Box sx={{ ...chartPanelSx, position: 'relative', width: '100%', maxWidth: '100%', height: 380 }}>
          <Bar key={resolvedMode} options={chartOptions} data={chartData} />
        </Box>
      ) : (
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          Set the start and end of a percentage range to see the chart.
        </Typography>
      )}
      {chartSelection !== OVERALL_CHART_VALUE ? (
        <AssignmentRubricPanel detail={rubricDetail} loading={rubricLoading} ratingOrder={ratings} />
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
        weightOverrides={weightOverrides}
        weightDraft={weightDraft}
        weightsDirty={weightsDirty}
        onWeightDraftChange={(assignmentId, value) => {
          setWeightDraft((current) => {
            const trimmed = value.trim();
            if (trimmed === '') {
              if (!(assignmentId in current)) return current;
              const next = { ...current };
              delete next[assignmentId];
              return next;
            }
            return { ...current, [assignmentId]: value };
          });
        }}
        onConfirmWeights={() => {
          const applied = commitWeightDraft(weightDraft);
          if (!manualWeightTotalValid(applied)) return;
          setWeightOverrides(applied);
          setWeightDraft(applied);
        }}
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
