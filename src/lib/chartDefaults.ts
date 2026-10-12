import { Chart, type ChartOptions } from 'chart.js';
import { appleColors, appleDarkColors, getApplePalette } from '@/theme/appleTheme';

export type ChartColorMode = 'light' | 'dark';

export function getChartSeries(mode: ChartColorMode) {
  if (mode === 'dark') {
    return {
      primary: appleDarkColors.blue,
      secondary: '#64d2ff',
      tertiary: '#ff9f0a',
      quaternary: '#bf5af2',
    } as const;
  }
  return {
    primary: appleColors.blue,
    secondary: '#30b0c7',
    tertiary: '#bf4800',
    quaternary: '#ac39ff',
  } as const;
}

/** @deprecated use getChartSeries(mode) */
export const CHART_SERIES = getChartSeries('light');

function chartPalette(mode: ChartColorMode) {
  const ui = getApplePalette(mode);
  const series = getChartSeries(mode);
  const palette = [
    series.primary,
    series.secondary,
    series.tertiary,
    series.quaternary,
    mode === 'dark' ? '#ffd60a' : '#ff9500',
    mode === 'dark' ? '#30d158' : '#34c759',
    mode === 'dark' ? '#5e5ce6' : '#5856d6',
    mode === 'dark' ? '#ff375f' : '#ff2d55',
  ];
  return {
    text: ui.text,
    tick: ui.textSecondary,
    grid: mode === 'dark' ? 'rgba(255, 255, 255, 0.14)' : 'rgba(0, 0, 0, 0.08)',
    tooltipBg: mode === 'dark' ? 'rgba(44, 44, 46, 0.96)' : 'rgba(29, 29, 31, 0.92)',
    tooltipText: mode === 'dark' ? '#f5f5f7' : '#ffffff',
    series,
    palette,
  };
}

let lastAppliedMode: ChartColorMode | null = null;

/** Re-apply global Chart.js colors when light/dark mode changes. */
export function applyChartJsDefaults(mode: ChartColorMode = 'light'): void {
  if (typeof window === 'undefined') return;
  if (lastAppliedMode === mode) return;
  lastAppliedMode = mode;

  const p = chartPalette(mode);
  Chart.defaults.font.family =
    '-apple-system, BlinkMacSystemFont, "SF Pro Text", "Segoe UI", sans-serif';
  Chart.defaults.color = p.tick;
  Chart.defaults.borderColor = p.grid;
  Chart.defaults.plugins.legend.labels.usePointStyle = true;
  Chart.defaults.plugins.legend.labels.boxWidth = 8;
  Chart.defaults.plugins.legend.labels.padding = 16;
  Chart.defaults.plugins.legend.labels.color = p.tick;
  Chart.defaults.plugins.tooltip.backgroundColor = p.tooltipBg;
  Chart.defaults.plugins.tooltip.titleColor = p.tooltipText;
  Chart.defaults.plugins.tooltip.bodyColor = p.tooltipText;
  Chart.defaults.plugins.tooltip.titleFont = { weight: 600, size: 13 };
  Chart.defaults.plugins.tooltip.bodyFont = { size: 12 };
  Chart.defaults.plugins.tooltip.padding = 12;
  Chart.defaults.plugins.tooltip.cornerRadius = 10;
}

function baseScaleOptions(mode: ChartColorMode) {
  const p = chartPalette(mode);
  return {
    grid: { color: p.grid, drawTicks: false },
    border: { display: false },
    ticks: {
      color: p.tick,
      font: { size: 11 },
      padding: 8,
    },
  };
}

export function lineChartOptions(
  title: string,
  mode: ChartColorMode = 'light',
  extra?: ChartOptions<'line'>,
): ChartOptions<'line'> {
  const p = chartPalette(mode);
  return {
    responsive: true,
    maintainAspectRatio: false,
    interaction: { mode: 'index', intersect: false },
    plugins: {
      legend: { position: 'top', align: 'end', labels: { color: p.tick } },
      title: {
        display: true,
        text: title,
        color: p.text,
        font: { size: 17, weight: 600 },
        padding: { bottom: 12 },
      },
    },
    scales: {
      x: {
        ...baseScaleOptions(mode),
        grid: { display: false },
        ticks: { ...baseScaleOptions(mode).ticks, color: p.tick },
      },
      y: {
        ...baseScaleOptions(mode),
      },
    },
    ...extra,
  };
}

export function barChartOptions(title: string, mode: ChartColorMode = 'light'): ChartOptions<'bar'> {
  const p = chartPalette(mode);
  return {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { display: false },
      title: {
        display: true,
        text: title,
        color: p.text,
        font: { size: 17, weight: 600 },
        padding: { bottom: 12 },
      },
    },
    scales: {
      x: {
        ...baseScaleOptions(mode),
        grid: { display: false },
      },
      y: {
        ...baseScaleOptions(mode),
        beginAtZero: true,
      },
    },
  };
}

export function chartColorForIndex(index: number, mode: ChartColorMode = 'light'): string {
  const p = chartPalette(mode);
  return p.palette[index % p.palette.length];
}

export function studentLineColor(studentId: number, mode: ChartColorMode = 'light'): string {
  const hue = (studentId * 47) % 360;
  const saturation = mode === 'dark' ? 70 : 52;
  const lightness = mode === 'dark' ? 68 : 48;
  return `hsl(${hue}, ${saturation}%, ${lightness}%)`;
}
