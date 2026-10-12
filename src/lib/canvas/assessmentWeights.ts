import type { AssessmentGradeRow } from './grades';

export type AssessmentWeightOverrides = Record<string, string>;

export const MAX_MANUAL_WEIGHT_TOTAL = 100;

export function formatWeightPercent(value: number): string {
  const rounded = Math.round(value * 10) / 10;
  return `${Number.isInteger(rounded) ? rounded : rounded.toFixed(1)}%`;
}

/** Canvas label shown when the field is empty. */
export function canvasWeightHint(row: AssessmentGradeRow): string {
  if (row.gradeWeight != null && Number.isFinite(row.gradeWeight) && row.gradeWeight > 0) {
    return formatWeightPercent(row.gradeWeight);
  }
  return row.weighting.trim() || '—';
}

/**
 * Parse a manual weight. Undefined means leave Canvas as-is (empty override).
 * Null means invalid input. Numbers are 0–100 inclusive.
 */
export function parseManualWeightInput(input: string): number | null | undefined {
  const trimmed = input.trim();
  if (trimmed === '') return undefined;
  const cleaned = trimmed.replace(/%/g, '').trim();
  if (cleaned === '') return undefined;
  const value = Number(cleaned);
  if (!Number.isFinite(value) || value < 0 || value > 100) return null;
  return value;
}

export function weightOverridesDirty(
  draft: AssessmentWeightOverrides,
  applied: AssessmentWeightOverrides,
): boolean {
  const keys = new Set([...Object.keys(draft), ...Object.keys(applied)]);
  for (const key of keys) {
    if ((draft[key] ?? '').trim() !== (applied[key] ?? '').trim()) return true;
  }
  return false;
}

/** Sum of parsed manual weights. Blank and invalid fields are left out. */
export function totalManualWeightPercent(overrides: AssessmentWeightOverrides): number {
  let sum = 0;
  for (const value of Object.values(overrides)) {
    const parsed = parseManualWeightInput(value);
    if (typeof parsed === 'number') sum += parsed;
  }
  return Math.round(sum * 10) / 10;
}

export function manualWeightTotalValid(overrides: AssessmentWeightOverrides): boolean {
  return totalManualWeightPercent(overrides) <= MAX_MANUAL_WEIGHT_TOTAL;
}

/** Keep only blank removals and values that parse as 0–100. */
export function commitWeightDraft(draft: AssessmentWeightOverrides): AssessmentWeightOverrides {
  const next: AssessmentWeightOverrides = {};
  for (const [key, value] of Object.entries(draft)) {
    const trimmed = value.trim();
    if (trimmed === '') continue;
    if (parseManualWeightInput(trimmed) === null) continue;
    next[key] = trimmed;
  }
  return next;
}

export function applyWeightOverrides(
  rows: AssessmentGradeRow[],
  overrides: AssessmentWeightOverrides,
): AssessmentGradeRow[] {
  return rows.map((row) => {
    const key = String(row.id);
    if (!(key in overrides)) return row;
    const parsed = parseManualWeightInput(overrides[key]);
    if (parsed === undefined || parsed === null) return row;
    return {
      ...row,
      weighting: formatWeightPercent(parsed),
      gradeWeight: parsed,
    };
  });
}
