'use client';

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import {
  readStoredThemeMode,
  writeStoredThemeMode,
  type ThemeModePreference,
} from '@/lib/client/themeModeStorage';

type ResolvedColorMode = 'light' | 'dark';

type ColorModeContextValue = {
  mode: ThemeModePreference;
  resolvedMode: ResolvedColorMode;
  setMode: (mode: ThemeModePreference) => void;
  ready: boolean;
};

const ColorModeContext = createContext<ColorModeContextValue | null>(null);

function getSystemDark(): boolean {
  if (typeof window === 'undefined') return false;
  return window.matchMedia('(prefers-color-scheme: dark)').matches;
}

export function ColorModeProvider({ children }: { children: React.ReactNode }) {
  const [mode, setModeState] = useState<ThemeModePreference>('system');
  const [systemDark, setSystemDark] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    setModeState(readStoredThemeMode());
    setSystemDark(getSystemDark());
    setReady(true);

    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = (event: MediaQueryListEvent) => {
      setSystemDark(event.matches);
    };
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);

  const setMode = useCallback((next: ThemeModePreference) => {
    writeStoredThemeMode(next);
    setModeState(next);
  }, []);

  const resolvedMode: ResolvedColorMode =
    mode === 'system' ? (systemDark ? 'dark' : 'light') : mode === 'dark' ? 'dark' : 'light';

  useEffect(() => {
    if (!ready) return;
    document.documentElement.style.colorScheme = resolvedMode;
  }, [ready, resolvedMode]);

  const value = useMemo(
    () => ({ mode, resolvedMode, setMode, ready }),
    [mode, resolvedMode, setMode, ready],
  );

  return <ColorModeContext.Provider value={value}>{children}</ColorModeContext.Provider>;
}

export function useColorMode() {
  const ctx = useContext(ColorModeContext);
  if (!ctx) {
    throw new Error('useColorMode must be used within ColorModeProvider');
  }
  return ctx;
}
