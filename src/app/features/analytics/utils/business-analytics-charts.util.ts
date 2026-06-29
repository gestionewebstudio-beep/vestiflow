import type { ChartData, ChartOptions } from 'chart.js';

import { formatMoney } from '@core/utils/money.util';

import type { BusinessAnalyticsSummary } from '../models/business-analytics.model';
import { moneyMinor } from './business-analytics-display.util';
import {
  baseBarChartOptions,
  baseDoughnutOptions,
  baseLineChartOptions,
  readChartThemePalette,
} from './chart-theme.util';

const TOP_PRODUCT_LIMIT = 8;

function formatChartDate(isoDate: string): string {
  const [, month, day] = isoDate.split('-');
  return `${day}/${month}`;
}

function minorToMajor(revenueMinor: number): number {
  return revenueMinor / 100;
}

function currencyTooltipLabel(
  value: number,
  currencyCode: BusinessAnalyticsSummary['currencyCode'],
): string {
  return formatMoney(moneyMinor(Math.round(value * 100), currencyCode));
}

function formatAxisCurrency(
  majorValue: number,
  currencyCode: BusinessAnalyticsSummary['currencyCode'],
): string {
  return new Intl.NumberFormat('it-IT', {
    style: 'currency',
    currency: currencyCode,
    maximumFractionDigits: 0,
  }).format(majorValue);
}

export function hasDailyRevenueData(summary: BusinessAnalyticsSummary): boolean {
  return summary.dailyRevenue.some((point) => point.revenueMinor !== 0);
}

export function buildDailyRevenueLineChart(summary: BusinessAnalyticsSummary): {
  data: ChartData<'line'>;
  options: ChartOptions<'line'>;
} {
  const palette = readChartThemePalette();
  const labels = summary.dailyRevenue.map((point) => formatChartDate(point.date));
  const values = summary.dailyRevenue.map((point) => minorToMajor(point.revenueMinor));

  const data: ChartData<'line'> = {
    labels,
    datasets: [
      {
        label: 'Fatturato',
        data: values,
        borderColor: palette.success,
        backgroundColor: withAlpha(palette.success, 0.12),
        fill: true,
        tension: 0.35,
        pointRadius: summary.dailyRevenue.length > 45 ? 0 : 3,
        pointHoverRadius: 5,
        pointBackgroundColor: palette.success,
        pointBorderColor: palette.surface,
        pointBorderWidth: 2,
      },
    ],
  };

  const base = baseLineChartOptions(palette);
  const options: ChartOptions<'line'> = {
    ...base,
    layout: {
      padding: {
        left: 4,
        bottom: 4,
      },
    },
    plugins: {
      ...base.plugins,
      tooltip: {
        ...base.plugins?.tooltip,
        callbacks: {
          label: (context) => {
            const value = context.parsed.y;
            if (value === null || value === undefined) {
              return '';
            }
            return currencyTooltipLabel(value, summary.currencyCode);
          },
        },
      },
    },
    scales: {
      ...base.scales,
      x: {
        ...base.scales?.['x'],
        offset: true,
        ticks: {
          ...base.scales?.['x']?.ticks,
          padding: 10,
        },
      },
      y: {
        ...base.scales?.['y'],
        ticks: {
          ...base.scales?.['y']?.ticks,
          padding: 10,
          callback: (value) => formatAxisCurrency(Number(value), summary.currencyCode),
        },
      },
    },
  };

  return { data, options };
}

export function buildChannelDoughnutChart(
  summary: BusinessAnalyticsSummary,
): { data: ChartData<'doughnut'>; options: ChartOptions<'doughnut'> } | null {
  const rows = summary.channels.filter((row) => row.revenueMinor > 0);
  if (rows.length === 0) {
    return null;
  }

  const palette = readChartThemePalette();
  const data: ChartData<'doughnut'> = {
    labels: rows.map((row) => row.label),
    datasets: [
      {
        data: rows.map((row) => minorToMajor(row.revenueMinor)),
        backgroundColor: rows.map(
          (_, index) => palette.series[index % palette.series.length] ?? palette.info,
        ),
        borderColor: palette.surface,
        borderWidth: 2,
        hoverOffset: 6,
      },
    ],
  };

  const base = baseDoughnutOptions(palette);
  const options: ChartOptions<'doughnut'> = {
    ...base,
    layout: {
      padding: 0,
    },
    plugins: {
      ...base.plugins,
      legend: {
        ...base.plugins?.legend,
        position: 'right',
        align: 'center',
        fullSize: false,
        labels: {
          ...base.plugins?.legend?.labels,
          padding: 8,
        },
      },
      tooltip: {
        ...base.plugins?.tooltip,
        callbacks: {
          label: (context) => {
            const value = context.parsed;
            if (value === null || value === undefined) {
              return '';
            }
            const total = rows.reduce((sum, row) => sum + row.revenueMinor, 0);
            const row = rows[context.dataIndex];
            const share = total > 0 && row ? Math.round((row.revenueMinor / total) * 1000) / 10 : 0;
            return `${currencyTooltipLabel(value, summary.currencyCode)} (${share.toLocaleString('it-IT', { maximumFractionDigits: 1 })}%)`;
          },
        },
      },
    },
  };

  return { data, options };
}

export function buildTopProductsBarChart(
  summary: BusinessAnalyticsSummary,
): { data: ChartData<'bar'>; options: ChartOptions<'bar'> } | null {
  const rows = summary.topProducts
    .filter((row) => row.revenueMinor > 0)
    .slice(0, TOP_PRODUCT_LIMIT);
  if (rows.length === 0) {
    return null;
  }

  const palette = readChartThemePalette();
  const labels = rows.map((row) => truncateLabel(row.title || row.sku, 28));

  const data: ChartData<'bar'> = {
    labels,
    datasets: [
      {
        label: 'Fatturato',
        data: rows.map((row) => minorToMajor(row.revenueMinor)),
        backgroundColor: withAlpha(palette.info, 0.85),
        borderColor: palette.info,
        borderWidth: 1,
        borderRadius: 4,
        maxBarThickness: 32,
      },
    ],
  };

  const base = baseBarChartOptions(palette);
  const options: ChartOptions<'bar'> = {
    ...base,
    indexAxis: 'y',
    interaction: {
      mode: 'nearest',
      axis: 'y',
      intersect: false,
    },
    plugins: {
      ...base.plugins,
      tooltip: {
        ...base.plugins?.tooltip,
        yAlign: 'center',
        xAlign: 'left',
        caretPadding: 8,
        callbacks: {
          title: (items) => {
            const index = items[0]?.dataIndex;
            const row = index === undefined ? undefined : rows[index];
            return row ? `${row.title} (${row.sku})` : '';
          },
          label: (context) => {
            const value = context.parsed.x;
            if (value === null || value === undefined) {
              return '';
            }
            const index = context.dataIndex;
            const units = rows[index]?.unitsSold ?? 0;
            return [currencyTooltipLabel(value, summary.currencyCode), `${units} pezzi`];
          },
        },
      },
    },
    scales: {
      x: {
        ...base.scales?.['x'],
        ticks: {
          ...base.scales?.['x']?.ticks,
          callback: (value) => formatAxisCurrency(Number(value), summary.currencyCode),
        },
      },
      y: {
        ...base.scales?.['y'],
        grid: { display: false },
      },
    },
  };

  return { data, options };
}

function truncateLabel(value: string, maxLength: number): string {
  if (value.length <= maxLength) {
    return value;
  }
  return `${value.slice(0, maxLength - 1)}…`;
}

function withAlpha(hexColor: string, alpha: number): string {
  if (!hexColor.startsWith('#')) {
    return hexColor;
  }
  const normalized = hexColor.slice(1);
  const expanded =
    normalized.length === 3
      ? normalized
          .split('')
          .map((char) => char + char)
          .join('')
      : normalized;
  const channels = expanded.match(/.{2}/g);
  if (!channels || channels.length < 3) {
    return hexColor;
  }
  const [r, g, b] = channels.map((part) => Number.parseInt(part, 16));
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}
