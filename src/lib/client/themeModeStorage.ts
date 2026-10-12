export type ThemeModePreference = 'system' | 'light' | 'dark';

const STORAGE_KEY = 'lads.theme.mode';

export function readStoredThemeMode(): ThemeModePreference {
  if (typeof window === 'undefined') return 'system';
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw === 'light' || raw === 'dark' || raw === 'system') return raw;
  } catch {
    // ignore
  }
  return 'system';
}

export function writeStoredThemeMode(mode: ThemeModePreference): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(STORAGE_KEY, mode);
  } catch {
    // ignore
  }
}
