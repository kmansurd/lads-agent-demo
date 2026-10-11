import { canvasRequest } from './client';

export type CatalogRating = {
  key: string;
  label: string;
  points: number | null;
  id: string | null;
};

export type CatalogCriterion = {
  id: string;
  key: string;
  description: string;
  points: number;
  scored: boolean;
  ratings: CatalogRating[];
};

export type ParsedMark = {
  criterionId: string;
  points: number | null;
  ratingId: string | null;
};

type RawRating = { id?: string | number; description?: string; points?: number };
type RawCriterion = {
  id?: string | number;
  description?: string;
  points?: number;
  ignore_for_scoring?: boolean;
  ratings?: RawRating[];
};

function stripHtml(value: string): string {
  return value
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, ' ')
    .trim();
}

function identityKey(value: string): string {
  return value.toLowerCase().replace(/\s*\/\s*/g, '/').replace(/\s+/g, ' ').trim();
}

function readCriteria(raw: unknown): RawCriterion[] {
  if (!raw) return [];
  if (Array.isArray(raw)) {
    if (raw.length === 0) return [];
    const first = raw[0] as { criteria?: unknown };
    if (first && Array.isArray(first.criteria)) {
      return raw.flatMap((item) => {
        const criteria = (item as { criteria?: RawCriterion[] }).criteria;
        return Array.isArray(criteria) ? criteria : [];
      });
    }
    return raw as RawCriterion[];
  }
  if (typeof raw === 'object' && Array.isArray((raw as { criteria?: unknown }).criteria)) {
    return (raw as { criteria: RawCriterion[] }).criteria;
  }
  return [];
}

function ratingLabel(rating: RawRating): string {
  const text = stripHtml(rating.description ?? '');
  if (text) return text;
  if (typeof rating.points === 'number') return `${rating.points} pts`;
  return rating.id != null ? `Rating ${rating.id}` : 'Rating';
}

export function criteriaFromRubric(raw: unknown): CatalogCriterion[] {
  return readCriteria(raw).map((criterion, index) => {
    const description = stripHtml(criterion.description ?? '') || `Criterion ${index + 1}`;
    const seen = new Set<string>();
    const ratings: CatalogRating[] = [];
    for (const rating of criterion.ratings ?? []) {
      const label = ratingLabel(rating);
      const key = identityKey(label);
      if (!key || seen.has(key)) continue;
      seen.add(key);
      ratings.push({
        key,
        label,
        points: typeof rating.points === 'number' ? rating.points : null,
        id: rating.id != null ? String(rating.id) : null,
      });
    }
    ratings.sort((a, b) => (b.points ?? -1) - (a.points ?? -1) || a.label.localeCompare(b.label));
    return {
      id: criterion.id != null ? String(criterion.id) : `criterion-${index}`,
      key: identityKey(description),
      description,
      points: criterion.points ?? 0,
      scored: criterion.ignore_for_scoring !== true,
      ratings,
    };
  });
}

export function marksFromUnknown(raw: unknown): ParsedMark[] {
  if (!raw || typeof raw !== 'object') return [];
  const record = raw as Record<string, unknown>;
  if (Array.isArray(record.data)) {
    return record.data.flatMap((row) => {
      if (!row || typeof row !== 'object') return [];
      const item = row as {
        criterion_id?: string | number;
        points?: number | null;
        rating_id?: string | number | null;
      };
      if (item.criterion_id == null) return [];
      return [
        {
          criterionId: String(item.criterion_id),
          points: typeof item.points === 'number' ? item.points : null,
          ratingId: item.rating_id != null ? String(item.rating_id) : null,
        },
      ];
    });
  }

  const marks: ParsedMark[] = [];
  for (const [key, value] of Object.entries(record)) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) continue;
    const row = value as {
      points?: number | null;
      rating_id?: string | number | null;
      criterion_id?: string | number;
    };
    const hasContent = row.points != null || row.rating_id != null;
    if (!hasContent) continue;
    marks.push({
      criterionId: String(row.criterion_id ?? key),
      points: typeof row.points === 'number' ? row.points : null,
      ratingId: row.rating_id != null ? String(row.rating_id) : null,
    });
  }
  return marks;
}

/** Match a saved mark to a rating name. The same name shares one key across criteria. */
export function assignRating(criterion: CatalogCriterion, mark: ParsedMark): string | null {
  if (mark.ratingId) {
    const found = criterion.ratings.find((rating) => rating.id === mark.ratingId);
    if (found) return found.key;
  }
  if (mark.points == null) return null;

  const byPoints = criterion.ratings.filter(
    (rating) => rating.points != null && Math.abs(rating.points - mark.points!) < 0.001,
  );
  if (byPoints.length === 1) return byPoints[0].key;

  const label = Number.isInteger(mark.points) ? `${mark.points} pts` : `${mark.points} pts`;
  const key = identityKey(label);
  if (!criterion.ratings.some((rating) => rating.key === key)) {
    criterion.ratings.push({ key, label, points: mark.points, id: mark.ratingId });
  }
  return key;
}

type QuizAssessment = {
  artifact_id?: number;
  assessment_type?: string;
  data?: {
    criterion_id?: string | number;
    points?: number | null;
    rating_id?: string | number | null;
  }[];
};

/** Criterion marks stored on the quiz rubric when the assignment submission has none. */
export async function loadQuizCriterionMarks(
  courseId: string,
  quizId: number,
  rubricId: number,
  submissionUser: Map<number, number>,
): Promise<{ criteria: CatalogCriterion[]; marksByUser: Map<number, ParsedMark[]> }> {
  const full = await canvasRequest<{ data?: unknown; assessments?: QuizAssessment[] }>(
    `/courses/${courseId}/rubrics/${rubricId}`,
    { 'include[]': 'assessments', style: 'full' },
  );

  const userByArtifact = new Map(submissionUser);
  for (let page = 1; page <= 20; page += 1) {
    const body = await canvasRequest<{ quiz_submissions?: { submission_id?: number; user_id?: number }[] }>(
      `/courses/${courseId}/quizzes/${quizId}/submissions`,
      { page: String(page), per_page: '100' },
    );
    const batch = body.quiz_submissions ?? [];
    for (const row of batch) {
      if (row.submission_id != null && row.user_id != null) {
        userByArtifact.set(row.submission_id, row.user_id);
      }
    }
    if (batch.length < 100) break;
  }

  const marksByUser = new Map<number, ParsedMark[]>();
  for (const assessment of full.assessments ?? []) {
    if (assessment.assessment_type && assessment.assessment_type !== 'grading') continue;
    if (assessment.artifact_id == null || !assessment.data?.length) continue;
    const userId = userByArtifact.get(assessment.artifact_id);
    if (userId == null) continue;
    const marks = assessment.data.flatMap((row) => {
      if (row.criterion_id == null) return [];
      return [
        {
          criterionId: String(row.criterion_id),
          points: typeof row.points === 'number' ? row.points : null,
          ratingId: row.rating_id != null ? String(row.rating_id) : null,
        },
      ];
    });
    if (marks.length > 0) marksByUser.set(userId, marks);
  }

  return { criteria: criteriaFromRubric(full.data), marksByUser };
}
