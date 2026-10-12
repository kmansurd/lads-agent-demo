'use client';
import * as React from 'react';
import createCache from '@emotion/cache';
import { useServerInsertedHTML } from 'next/navigation';
import { CacheProvider as EmotionCacheProvider } from '@emotion/react';
import { ThemeProvider } from '@mui/material/styles';
import CssBaseline from '@mui/material/CssBaseline';
import { createAppleTheme } from '@/theme/appleTheme';
import { applyChartJsDefaults } from '@/lib/chartDefaults';
import { ColorModeProvider, useColorMode } from '@/context/ColorModeContext';

function ThemeShell({ children }: { children: React.ReactNode }) {
  const { resolvedMode } = useColorMode();
  const theme = React.useMemo(() => createAppleTheme(resolvedMode), [resolvedMode]);

  React.useEffect(() => {
    applyChartJsDefaults(resolvedMode);
  }, [resolvedMode]);

  // Emotion/CssBaseline can leave the previous mode's body colors in place after a flip.
  // Force the active palette on html/body (with !important) so inherited text stays readable.
  React.useEffect(() => {
    const { background, text } = theme.palette;
    const root = document.documentElement;
    const body = document.body;
    root.style.colorScheme = resolvedMode;
    root.style.setProperty('background-color', background.default, 'important');
    body.style.setProperty('background-color', background.default, 'important');
    body.style.setProperty('color', text.primary, 'important');
    return () => {
      root.style.removeProperty('background-color');
      body.style.removeProperty('background-color');
      body.style.removeProperty('color');
    };
  }, [theme, resolvedMode]);

  return (
    <ThemeProvider theme={theme}>
      <CssBaseline key={resolvedMode} enableColorScheme />
      {children}
    </ThemeProvider>
  );
}

export default function ThemeRegistry({ children }: { children: React.ReactNode }) {
  const [{ cache, flush }] = React.useState(() => {
    const cache = createCache({ key: 'mui' });
    cache.compat = true;
    const prevInsert = cache.insert;
    let inserted: string[] = [];
    cache.insert = (...args) => {
      const serialized = args[1];
      if (cache.inserted[serialized.name] === undefined) {
        inserted.push(serialized.name);
      }
      return prevInsert(...args);
    };
    const flush = () => {
      const prevInserted = inserted;
      inserted = [];
      return prevInserted;
    };
    return { cache, flush };
  });

  useServerInsertedHTML(() => {
    const names = flush();
    if (names.length === 0) {
      return null;
    }
    let styles = '';
    for (const name of names) {
      styles += cache.inserted[name];
    }
    return (
      <style
        key={cache.key}
        data-emotion={`${cache.key} ${names.join(' ')}`}
        dangerouslySetInnerHTML={{
          __html: styles,
        }}
      />
    );
  });

  return (
    <EmotionCacheProvider value={cache}>
      <ColorModeProvider>
        <ThemeShell>{children}</ThemeShell>
      </ColorModeProvider>
    </EmotionCacheProvider>
  );
}
