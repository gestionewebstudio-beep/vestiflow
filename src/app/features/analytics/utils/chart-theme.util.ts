import type { ChartOptions } from 'chart.js';

/** Legge un token CSS dal documento (fallback in SSR/test). */
export function readCssToken(name: string, fallback: string): string {
  if (typeof document === 'undefined') {
    return fallback;
  }
  const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return value || fallback;
}

export interface ChartThemePalette {
  readonly text: string;
  readonly textMuted: string;
  readonly border: string;
  readonly surface: string;
  readonly primary: string;
  readonly success: string;
  readonly info: string;
  readonly warning: string;
  readonly series: readonly string[];
}

export function readChartThemePalette(): ChartThemePalette {
  return {
    text: readCssToken('--color-text', '#303030'),
    textMuted: readCssToken('--color-text-muted', '#616161'),
    border: readCssToken('--color-border', '#e3e3e3'),
    surface: readCssToken('--color-surface', '#ffffff'),
    primary: readCssToken('--color-primary', '#303030'),
    success: readCssToken('--green-500', '#047c5d'),
    info: readCssToken('--blue-500', '#005bd3'),
    warning: readCssToken('--orange-500', '#ffb800'),
    series: [
      readCssToken('--blue-500', '#005bd3'),
      readCssToken('--green-500', '#047c5d'),
      readCssToken('--orange-500', '#ffb800'),
      readCssToken('--blue-300', '#91d0ff'),
      readCssToken('--green-300', '#92fcac'),
    ],
  };
}

function tooltipColors(palette: ChartThemePalette) {
  return {
    backgroundColor: palette.surface,
    titleColor: palette.text,
    bodyColor: palette.textMuted,
    borderColor: palette.border,
    borderWidth: 1,
    padding: 12,
  };
}

export function baseLineChartOptions(palette: ChartThemePalette): ChartOptions<'line'> {
  return {
    responsive: true,
    maintainAspectRatio: false,
    interaction: { mode: 'index', intersect: false },
    plugins: {
      legend: { display: false },
      tooltip: tooltipColors(palette),
    },
    scales: {
      x: {
        ticks: { color: palette.textMuted, maxRotation: 0, autoSkip: true, maxTicksLimit: 12 },
        grid: { color: palette.border, drawTicks: false },
        border: { color: palette.border },
      },
      y: {
        ticks: { color: palette.textMuted },
        grid: { color: palette.border, drawTicks: false },
        border: { color: palette.border },
        beginAtZero: true,
      },
    },
  };
}

export function baseBarChartOptions(palette: ChartThemePalette): ChartOptions<'bar'> {
  return {
    responsive: true,
    maintainAspectRatio: false,
    interaction: { mode: 'index', intersect: false },
    plugins: {
      legend: { display: false },
      tooltip: tooltipColors(palette),
    },
    scales: {
      x: {
        ticks: { color: palette.textMuted, maxRotation: 0, autoSkip: true, maxTicksLimit: 12 },
        grid: { color: palette.border, drawTicks: false },
        border: { color: palette.border },
      },
      y: {
        ticks: { color: palette.textMuted },
        grid: { color: palette.border, drawTicks: false },
        border: { color: palette.border },
        beginAtZero: true,
      },
    },
  };
}

export function baseDoughnutOptions(palette: ChartThemePalette): ChartOptions<'doughnut'> {
  return {
    responsive: true,
    maintainAspectRatio: false,
    cutout: '62%',
    plugins: {
      legend: {
        position: 'bottom',
        labels: {
          color: palette.textMuted,
          boxWidth: 12,
          boxHeight: 12,
          padding: 16,
        },
      },
      tooltip: tooltipColors(palette),
    },
  };
}
