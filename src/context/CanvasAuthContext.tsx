'use client';

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import { readStoredCanvasToken, writeStoredCanvasToken } from '@/lib/client/canvasTokenStorage';

type CanvasAuthContextValue = {
  /** Token persisted in this browser (empty until the user saves one). */
  savedToken: string;
  hasSavedToken: boolean;
  /** False until localStorage has been read on the client. */
  authReady: boolean;
  /** Bumps when the saved token changes so data hooks can refetch. */
  tokenRevision: number;
  saveToken: (token: string) => void;
  clearToken: () => void;
};

const CanvasAuthContext = createContext<CanvasAuthContextValue | null>(null);

export function CanvasAuthProvider({ children }: { children: React.ReactNode }) {
  const [savedToken, setSavedToken] = useState('');
  const [tokenRevision, setTokenRevision] = useState(0);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    setSavedToken(readStoredCanvasToken());
    setHydrated(true);
  }, []);

  const saveToken = useCallback((token: string) => {
    const trimmed = token.trim();
    writeStoredCanvasToken(trimmed);
    setSavedToken(trimmed);
    setTokenRevision((n) => n + 1);
  }, []);

  const clearToken = useCallback(() => {
    writeStoredCanvasToken('');
    setSavedToken('');
    setTokenRevision((n) => n + 1);
  }, []);

  const value = useMemo(
    () => ({
      savedToken: hydrated ? savedToken : '',
      hasSavedToken: hydrated && savedToken.length > 0,
      authReady: hydrated,
      tokenRevision,
      saveToken,
      clearToken,
    }),
    [hydrated, savedToken, tokenRevision, saveToken, clearToken],
  );

  return <CanvasAuthContext.Provider value={value}>{children}</CanvasAuthContext.Provider>;
}

export function useCanvasAuth() {
  const ctx = useContext(CanvasAuthContext);
  if (!ctx) {
    throw new Error('useCanvasAuth must be used within CanvasAuthProvider');
  }
  return ctx;
}
