'use client';

import { alpha, createTheme } from '@mui/material/styles';

const shared = {
  blue: '#0071e3',
  blueHover: '#0077ed',
};

/** Light (White) palette — exported for charts */
export const appleColors = {
  ...shared,
  text: '#1d1d1f',
  textSecondary: '#6e6e73',
  textTertiary: '#86868b',
  bg: '#fbfbfd',
  bgElevated: '#ffffff',
  divider: 'rgba(0, 0, 0, 0.08)',
  dividerStrong: 'rgba(0, 0, 0, 0.12)',
  sliderThumb: '#ffffff',
};

export const appleDarkColors = {
  blue: '#0a84ff',
  blueHover: '#409cff',
  text: '#f5f5f7',
  /** High contrast secondary copy on black / elevated surfaces */
  textSecondary: '#ebebf0',
  textTertiary: '#d1d1d6',
  bg: '#000000',
  bgElevated: '#1c1c1e',
  divider: 'rgba(255, 255, 255, 0.16)',
  dividerStrong: 'rgba(255, 255, 255, 0.28)',
  sliderThumb: '#f5f5f7',
};

const darkAppleColors = appleDarkColors;

type ThemeColors = typeof appleColors;

const fontStack =
  '-apple-system, BlinkMacSystemFont, "SF Pro Display", "SF Pro Text", "Segoe UI", Roboto, Helvetica, Arial, sans-serif';

export function getApplePalette(mode: 'light' | 'dark'): ThemeColors {
  return mode === 'dark' ? darkAppleColors : appleColors;
}

export function createAppleTheme(mode: 'light' | 'dark' = 'light') {
  const palette: ThemeColors = getApplePalette(mode);
  const isDark = mode === 'dark';

  return createTheme({
  palette: {
    mode,
    primary: {
      main: palette.blue,
      dark: palette.blueHover,
      contrastText: '#ffffff',
    },
    background: {
      default: palette.bg,
      paper: palette.bgElevated,
    },
    text: {
      primary: palette.text,
      secondary: palette.textSecondary,
    },
    divider: palette.divider,
    action: {
      hover: alpha(palette.text, mode === 'light' ? 0.04 : 0.08),
      selected: alpha(palette.blue, 0.12),
    },
  },
  shape: {
    borderRadius: 12,
  },
  typography: {
    fontFamily: fontStack,
    allVariants: {
      color: palette.text,
    },
    h4: { fontWeight: 600, letterSpacing: '-0.022em', lineHeight: 1.15, color: palette.text },
    h5: { fontWeight: 600, letterSpacing: '-0.02em', lineHeight: 1.2, color: palette.text },
    h6: { fontWeight: 600, letterSpacing: '-0.018em', lineHeight: 1.25, color: palette.text },
    subtitle1: { fontWeight: 500, letterSpacing: '-0.01em', color: palette.text },
    subtitle2: { fontWeight: 500, letterSpacing: '-0.008em', color: palette.text },
    body1: {
      fontSize: '1.0625rem',
      lineHeight: 1.47059,
      letterSpacing: '-0.011em',
      color: palette.text,
    },
    body2: {
      fontSize: '0.9375rem',
      lineHeight: 1.47059,
      letterSpacing: '-0.006em',
      color: palette.text,
    },
    caption: { fontSize: '0.8125rem', lineHeight: 1.38462, color: palette.textSecondary },
    button: {
      textTransform: 'none',
      fontWeight: 500,
      letterSpacing: '-0.01em',
      color: 'inherit',
    },
  },
  transitions: {
    duration: { shortest: 150, shorter: 200, short: 250, standard: 300 },
    easing: {
      easeInOut: 'cubic-bezier(0.4, 0, 0.2, 1)',
      easeOut: 'cubic-bezier(0, 0, 0.2, 1)',
      easeIn: 'cubic-bezier(0.4, 0, 1, 1)',
      sharp: 'cubic-bezier(0.4, 0, 0.6, 1)',
    },
  },
  components: {
    MuiCssBaseline: {
      styleOverrides: {
        html: {
          colorScheme: mode,
          backgroundColor: palette.bg,
        },
        body: {
          backgroundColor: palette.bg,
          color: palette.text,
        },
        '::selection': {
          backgroundColor: alpha(palette.blue, 0.25),
        },
        code: {
          backgroundColor: alpha(palette.text, isDark ? 0.12 : 0.06),
          color: palette.text,
        },
      },
    },
    MuiButton: {
      defaultProps: { disableElevation: true },
      styleOverrides: {
        root: {
          borderRadius: 980,
          padding: '8px 18px',
          transition: 'background-color 0.25s ease, color 0.25s ease, transform 0.15s ease',
          '&:active': { transform: 'scale(0.98)' },
        },
        containedPrimary: {
          backgroundColor: palette.blue,
          '&:hover': { backgroundColor: palette.blueHover },
        },
        outlined: {
          borderColor: palette.dividerStrong,
          color: isDark ? palette.text : palette.blue,
          '&:hover': {
            borderColor: alpha(palette.text, 0.2),
            backgroundColor: alpha(palette.text, isDark ? 0.08 : 0.03),
          },
        },
        text: {
          color: isDark ? '#64b5ff' : palette.blue,
        },
        inherit: {
          color: palette.text,
        },
      },
    },
    MuiIconButton: {
      styleOverrides: {
        root: {
          color: palette.textSecondary,
          transition: 'background-color 0.2s ease, transform 0.15s ease, color 0.2s ease',
          '&:hover': { color: palette.text },
          '&:active': { transform: 'scale(0.94)' },
        },
      },
    },
    MuiSvgIcon: {
      styleOverrides: {
        root: {
          color: 'inherit',
        },
      },
    },
    MuiPaper: {
      defaultProps: { elevation: 0 },
      styleOverrides: {
        root: {
          backgroundImage: 'none',
          backgroundColor: palette.bgElevated,
          color: palette.text,
          borderRadius: 16,
          border: `1px solid ${palette.divider}`,
        },
      },
    },
    MuiMenuItem: {
      styleOverrides: {
        root: {
          color: palette.text,
        },
      },
    },
    MuiTableCell: {
      styleOverrides: {
        root: {
          color: palette.text,
          borderColor: palette.divider,
        },
        head: {
          color: palette.text,
          fontWeight: 600,
        },
      },
    },
    MuiAppBar: {
      defaultProps: { elevation: 0, color: 'default' },
      styleOverrides: {
        root: {
          backgroundColor: alpha(palette.bgElevated, isDark ? 0.82 : 0.72),
          color: palette.text,
          backdropFilter: 'saturate(180%) blur(20px)',
          borderBottom: `1px solid ${palette.divider}`,
        },
      },
    },
    MuiTabs: {
      styleOverrides: {
        root: {
          minHeight: 48,
          backgroundColor: alpha(palette.bgElevated, 0.6),
        },
        indicator: {
          height: 2,
          borderRadius: 1,
          backgroundColor: palette.text,
        },
      },
    },
    MuiTab: {
      styleOverrides: {
        root: {
          textTransform: 'none',
          fontWeight: 400,
          fontSize: '0.9375rem',
          letterSpacing: '-0.01em',
          minHeight: 48,
          color: palette.textSecondary,
          transition: 'color 0.25s ease',
          '&.Mui-selected': {
            color: palette.text,
            fontWeight: 500,
          },
        },
      },
    },
    MuiListItemButton: {
      styleOverrides: {
        root: {
          borderRadius: 10,
          margin: '2px 8px',
          color: palette.text,
          transition: 'background-color 0.2s ease, color 0.2s ease',
          '& .MuiListItemText-primary': {
            color: palette.text,
          },
          '& .MuiListItemText-secondary': {
            color: palette.textSecondary,
          },
          '& .MuiSvgIcon-root': {
            color: 'inherit',
          },
          '&.Mui-selected': {
            backgroundColor: alpha(palette.blue, isDark ? 0.22 : 0.1),
            color: palette.text,
            '&:hover': { backgroundColor: alpha(palette.blue, isDark ? 0.28 : 0.14) },
            '& .MuiListItemText-primary': {
              color: palette.text,
              fontWeight: 600,
            },
          },
        },
      },
    },
    MuiListItemText: {
      styleOverrides: {
        primary: { color: palette.text },
        secondary: { color: palette.textSecondary },
      },
    },
    MuiInputLabel: {
      styleOverrides: {
        root: {
          color: palette.textSecondary,
          '&.Mui-focused': { color: palette.blue },
        },
      },
    },
    MuiFormHelperText: {
      styleOverrides: {
        root: { color: palette.textSecondary },
      },
    },
    MuiToggleButton: {
      styleOverrides: {
        root: {
          color: palette.textSecondary,
          borderColor: palette.dividerStrong,
          '&.Mui-selected': {
            color: palette.text,
            backgroundColor: alpha(palette.blue, isDark ? 0.22 : 0.1),
          },
        },
      },
    },
    MuiTextField: {
      defaultProps: { variant: 'outlined', size: 'small' },
    },
    MuiOutlinedInput: {
      styleOverrides: {
        root: {
          borderRadius: 10,
          color: palette.text,
          transition: 'box-shadow 0.2s ease, border-color 0.2s ease',
          '&.Mui-focused .MuiOutlinedInput-notchedOutline': {
            borderColor: palette.blue,
            borderWidth: 1,
          },
          '& .MuiOutlinedInput-input': {
            color: palette.text,
            WebkitTextFillColor: palette.text,
            '&::placeholder': {
              color: palette.textSecondary,
              opacity: 0.7,
              WebkitTextFillColor: palette.textSecondary,
            },
          },
        },
        notchedOutline: {
          borderColor: palette.dividerStrong,
        },
      },
    },
    MuiSelect: {
      styleOverrides: {
        outlined: { borderRadius: 10 },
      },
    },
    MuiSlider: {
      styleOverrides: {
        root: { height: 4, padding: '12px 0' },
        thumb: {
          width: 18,
          height: 18,
          backgroundColor: palette.sliderThumb,
          border: `1px solid ${alpha(palette.text, 0.15)}`,
          boxShadow: '0 1px 4px rgba(0,0,0,0.12)',
          transition: 'box-shadow 0.2s ease, transform 0.15s ease',
          '&:hover, &.Mui-focusVisible': {
            boxShadow: '0 2px 8px rgba(0,0,0,0.16)',
          },
        },
        track: {
          height: 4,
          border: 'none',
          backgroundColor: palette.text,
        },
        rail: {
          height: 4,
          opacity: 1,
          backgroundColor: alpha(palette.text, isDark ? 0.28 : 0.12),
        },
        valueLabel: {
          borderRadius: 8,
          backgroundColor: isDark ? palette.bgElevated : palette.text,
          color: isDark ? palette.text : palette.bgElevated,
          border: isDark ? `1px solid ${palette.dividerStrong}` : 'none',
          fontWeight: 500,
        },
      },
    },
    MuiChip: {
      styleOverrides: {
        root: { borderRadius: 8, fontWeight: 500 },
        outlined: { borderColor: palette.dividerStrong },
      },
    },
    MuiAlert: {
      styleOverrides: {
        root: {
          borderRadius: 14,
          border: `1px solid ${palette.divider}`,
        },
        standardInfo: {
          backgroundColor: alpha(palette.blue, isDark ? 0.2 : 0.06),
          color: palette.text,
        },
        standardSuccess: {
          backgroundColor: alpha('#34c759', isDark ? 0.22 : 0.08),
          color: palette.text,
        },
        standardWarning: {
          backgroundColor: alpha('#ff9500', isDark ? 0.22 : 0.08),
          color: palette.text,
        },
        standardError: {
          backgroundColor: alpha('#ff3b30', isDark ? 0.22 : 0.08),
          color: palette.text,
        },
      },
    },
    MuiDataGrid: {
      styleOverrides: {
        root: {
          border: 'none',
          borderRadius: 16,
          fontSize: '0.875rem',
          letterSpacing: '-0.006em',
          color: palette.text,
          '& .MuiDataGrid-columnHeaders': {
            backgroundColor: alpha(palette.text, isDark ? 0.1 : 0.03),
            borderBottom: `1px solid ${palette.divider}`,
            fontSize: '0.8125rem',
            fontWeight: 600,
            color: palette.text,
          },
          '& .MuiDataGrid-cell': {
            borderColor: palette.divider,
            color: palette.text,
          },
          '& .MuiDataGrid-row:hover': {
            backgroundColor: alpha(palette.text, isDark ? 0.06 : 0.02),
          },
          '& .MuiDataGrid-footerContainer': {
            borderTop: `1px solid ${palette.divider}`,
          },
        },
      },
    },
    MuiFab: {
      styleOverrides: {
        root: {
          boxShadow: '0 4px 24px rgba(0,0,0,0.12)',
          transition: 'transform 0.25s ease, box-shadow 0.25s ease',
          '&:hover': {
            boxShadow: '0 8px 32px rgba(0,0,0,0.16)',
          },
          '&:active': { transform: 'scale(0.96)' },
        },
        primary: {
          backgroundColor: palette.blue,
          '&:hover': { backgroundColor: palette.blueHover },
        },
      },
    },
    MuiPopover: {
      styleOverrides: {
        paper: {
          borderRadius: 18,
          boxShadow: '0 12px 40px rgba(0,0,0,0.12)',
          border: `1px solid ${palette.divider}`,
        },
      },
    },
    MuiCard: {
      defaultProps: { elevation: 0 },
      styleOverrides: {
        root: {
          borderRadius: 16,
          border: `1px solid ${palette.divider}`,
        },
      },
    },
    MuiDivider: {
      styleOverrides: {
        root: { borderColor: palette.divider },
      },
    },
    MuiCircularProgress: {
      styleOverrides: {
        root: { color: palette.textSecondary },
      },
    },
  },
  });
}

export const appleTheme = createAppleTheme('light');

/** Wrap DataGrid in a bordered shell (theme styles the grid itself). */
export const dataGridShellSx = {
  border: '1px solid',
  borderColor: 'divider',
  borderRadius: 4,
  overflow: 'hidden',
  bgcolor: 'background.paper',
} as const;

export const chartPanelSx = {
  p: { xs: 2, sm: 3 },
  borderRadius: 4,
  border: '1px solid',
  borderColor: 'divider',
  bgcolor: 'background.paper',
} as const;
