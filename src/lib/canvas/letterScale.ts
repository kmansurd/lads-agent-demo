export type LetterBucket = 'A' | 'B' | 'C' | 'D' | 'F';

export function scoreToLetter(score: number | null | undefined): LetterBucket | null {
  if (score == null || Number.isNaN(score)) return null;
  if (score >= 90) return 'A';
  if (score >= 80) return 'B';
  if (score >= 70) return 'C';
  if (score >= 60) return 'D';
  return 'F';
}
