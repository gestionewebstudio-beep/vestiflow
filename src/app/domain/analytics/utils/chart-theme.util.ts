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
  // Restyle "Tech Moderno": palette = accento indigo (--color-primary) + verde
  // brand Shopify (--color-brand); gridlines/asse = --color-border. I fallback
  // riflettono il tema dark di default.
  return {
    text: readCssToken('--color-text', '#e9ecf2'),
    textMuted: readCssToken('--color-text-muted', '#9ba3b0'),
    border: readCssToken('--color-border', '#262a33'),
    surface: readCssToken('--color-surface', '#14161b'),
    primary: readCssToken('--color-primary', '#6c7bff'),
    success: readCssToken('--color-brand', '#3ddc97'),
    info: readCssToken('--status-info-fg', '#4cc3ff'),
    warning: readCssToken('--status-warning-fg', '#ffb02e'),
    series: [
      readCssToken('--color-primary', '#6c7bff'),
      readCssToken('--color-brand', '#3ddc97'),
      readCssToken('--color-interactive-active', '#aab3ff'),
      readCssToken('--status-warning-fg', '#ffb02e'),
      readCssToken('--status-info-fg', '#4cc3ff'),
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
