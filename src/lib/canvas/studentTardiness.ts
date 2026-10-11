type TardinessBreakdown = {
  on_time?: number;
  late?: number;
  missing?: number;
  total?: number;
};

export type MissingWorkSignal = {
  /** Estimated share of work missing (0–100), null if analytics unavailable. */
  missingWorkPct: number | null;
  label: string;
};

export function missingWorkFromSummary(
  breakdown: TardinessBreakdown | undefined,
): MissingWorkSignal {
  if (!breakdown) {
    return { missingWorkPct: null, label: '—' };
  }

  const onTime = breakdown.on_time ?? 0;
  const late = breakdown.late ?? 0;
  const missing = breakdown.missing ?? 0;

  const looksLikeFraction =
    onTime <= 1 && late <= 1 && missing <= 1 && onTime + late + missing <= 1.05;

  const missingPct = looksLikeFraction
    ? Math.round(missing * 100)
    : breakdown.total && breakdown.total > 0
      ? Math.round((missing / breakdown.total) * 100)
      : Math.round(missing);

  if (missingPct >= 40) {
    return { missingWorkPct: missingPct, label: 'High missing' };
  }
  if (missingPct >= 20) {
    return { missingWorkPct: missingPct, label: 'Some missing' };
  }
  if (missingPct > 0) {
    return { missingWorkPct: missingPct, label: 'Low missing' };
  }
  return { missingWorkPct: 0, label: 'On track' };
}
