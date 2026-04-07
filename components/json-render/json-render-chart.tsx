'use client';

import type { ReactNode } from 'react';
import type { BaseComponentProps } from '@json-render/react';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  XAxis,
  YAxis,
} from 'recharts';
import {
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from '@/components/ui/chart';

const DEFAULT_COLORS = [
  'hsl(var(--chart-1))',
  'hsl(var(--chart-2))',
  'hsl(var(--chart-3))',
  'hsl(var(--chart-4))',
  'hsl(var(--chart-5))',
];

type ChartProps = {
  title: string | null;
  description: string | null;
  variant: 'bar' | 'line' | 'area';
  /** Rows to plot; models sometimes emit `rows` instead. */
  data?: Array<Record<string, string | number | boolean>> | null;
  rows?: Array<Record<string, string | number | boolean>> | null;
  xKey?: string | null;
  series?: Array<{
    dataKey: string;
    label: string | null;
    color: string | null;
  }> | null;
};

function normalizeData(
  rows: Array<Record<string, string | number | boolean>> | null | undefined,
  seriesKeys: string[],
): Record<string, string | number | boolean | null>[] {
  const safe = Array.isArray(rows) ? rows : [];
  return safe.map((row) => {
    const next: Record<string, string | number | boolean | null> = { ...row };
    for (const key of seriesKeys) {
      const v = next[key];
      if (typeof v === 'string' && v.trim() !== '' && !Number.isNaN(Number(v))) {
        next[key] = Number(v);
      }
    }
    return next;
  });
}

export function JsonRenderChart({ props }: BaseComponentProps<ChartProps>) {
  const p = props as ChartProps;
  const variant = p.variant ?? 'bar';
  const rows = Array.isArray(p.data)
    ? p.data
    : Array.isArray(p.rows)
      ? p.rows
      : [];
  const seriesList = Array.isArray(p.series) ? p.series : [];
  const xKey =
    typeof p.xKey === 'string' && p.xKey.trim() !== '' ? p.xKey : 'name';

  const chartConfig: ChartConfig = {};
  seriesList.forEach((s, i) => {
    chartConfig[s.dataKey] = {
      label: s.label ?? s.dataKey,
      color: s.color ?? DEFAULT_COLORS[i % DEFAULT_COLORS.length],
    };
  });

  const keys = seriesList.map((s) => s.dataKey);
  const chartData = normalizeData(rows, keys);

  if (!seriesList.length) {
    return (
      <div className="text-sm text-muted-foreground rounded-md border p-4">
        Chart is missing <code className="font-mono text-xs">series</code>{' '}
        (and each row must include{' '}
        <code className="font-mono text-xs">xKey</code> and series keys).
      </div>
    );
  }

  if (!chartData.length) {
    return (
      <div className="text-sm text-muted-foreground rounded-md border p-4">
        No chart data.
      </div>
    );
  }

  const grid = (
    <CartesianGrid vertical={false} className="stroke-border/50" />
  );
  const xAxis = (
    <XAxis
      dataKey={xKey}
      tickLine={false}
      axisLine={false}
      tickMargin={8}
    />
  );
  const yAxis = (
    <YAxis
      tickLine={false}
      axisLine={false}
      tickMargin={10}
      width={64}
      tick={{ fontSize: 11 }}
    />
  );
  const tooltip = <ChartTooltip content={<ChartTooltipContent />} />;
  const legend = <ChartLegend content={<ChartLegendContent />} />;

  /** Extra left/right margin so Y tick labels (e.g. 5-digit values) are not clipped. */
  const chartMargin = { top: 8, right: 12, left: 8, bottom: 8 };

  const chartShared = {
    accessibilityLayer: true as const,
    data: chartData,
    margin: chartMargin,
  };

  let inner: ReactNode;
  if (variant === 'bar') {
    inner = (
      <BarChart {...chartShared}>
        {grid}
        {xAxis}
        {yAxis}
        {tooltip}
        {legend}
        {seriesList.map((s) => (
          <Bar
            key={s.dataKey}
            dataKey={s.dataKey}
            fill={`var(--color-${s.dataKey})`}
            radius={4}
          />
        ))}
      </BarChart>
    );
  } else if (variant === 'line') {
    inner = (
      <LineChart {...chartShared}>
        {grid}
        {xAxis}
        {yAxis}
        {tooltip}
        {legend}
        {seriesList.map((s) => (
          <Line
            key={s.dataKey}
            type="monotone"
            dataKey={s.dataKey}
            stroke={`var(--color-${s.dataKey})`}
            strokeWidth={2}
            dot={false}
          />
        ))}
      </LineChart>
    );
  } else {
    inner = (
      <AreaChart {...chartShared}>
        {grid}
        {xAxis}
        {yAxis}
        {tooltip}
        {legend}
        {seriesList.map((s) => (
          <Area
            key={s.dataKey}
            type="monotone"
            dataKey={s.dataKey}
            stroke={`var(--color-${s.dataKey})`}
            fill={`var(--color-${s.dataKey})`}
            fillOpacity={0.25}
          />
        ))}
      </AreaChart>
    );
  }

  return (
    <ChartContainer
      config={chartConfig}
      className="min-h-[240px] w-full px-1 sm:px-2 [&_.recharts-surface]:overflow-visible"
    >
      {inner}
    </ChartContainer>
  );
}
