"use client";

import Link from "next/link";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ComposedChart,
  Legend,
  Line,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { MonthPoint, Slice, Stacked } from "../_lib/dashboard";

const AXIS = { fontSize: 11, fill: "#64748b" };
const GRID = "#eef1f6";
const TIP = {
  borderRadius: 8,
  border: "1px solid #e2e8f0",
  fontSize: 12,
  boxShadow: "0 4px 12px rgba(15,23,42,0.08)",
};
const inr = (n: number) => `₹${Math.round(n).toLocaleString("en-IN")}`;
const compactInr = (n: number) =>
  n >= 1e7
    ? `₹${(n / 1e7).toFixed(1)}Cr`
    : n >= 1e5
      ? `₹${(n / 1e5).toFixed(1)}L`
      : n >= 1e3
        ? `₹${(n / 1e3).toFixed(0)}k`
        : `₹${n}`;

function Empty({
  text = "No data yet",
  h = "h-56",
}: {
  text?: string;
  h?: string;
}) {
  return (
    <div
      className={`flex ${h} items-center justify-center rounded-lg bg-slate-50 text-sm text-slate-400`}
    >
      {text}
    </div>
  );
}

/** Headcount line over monthly joiner / exit bars. */
export function HeadcountTrend({ data }: { data: MonthPoint[] }) {
  if (!data.some((d) => d.headcount || d.joiners || d.exits))
    return <Empty h="h-72" />;
  return (
    <div className="h-72 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart
          data={data}
          margin={{ top: 8, right: 4, left: -14, bottom: 0 }}
        >
          <CartesianGrid vertical={false} stroke={GRID} />
          <XAxis
            dataKey="month"
            tickLine={false}
            axisLine={false}
            tick={AXIS}
            interval="preserveStartEnd"
            minTickGap={8}
          />
          <YAxis
            yAxisId="hc"
            allowDecimals={false}
            tickLine={false}
            axisLine={false}
            tick={AXIS}
          />
          <YAxis
            yAxisId="moves"
            orientation="right"
            allowDecimals={false}
            tickLine={false}
            axisLine={false}
            tick={AXIS}
            width={28}
          />
          <Tooltip
            contentStyle={TIP}
            cursor={{ fill: "rgba(79,70,229,0.06)" }}
          />
          <Legend
            iconType="circle"
            iconSize={8}
            wrapperStyle={{ fontSize: 12, paddingTop: 4 }}
          />
          <Bar
            yAxisId="moves"
            dataKey="joiners"
            name="Joined"
            fill="#10b981"
            radius={[4, 4, 0, 0]}
            maxBarSize={18}
            isAnimationActive={false}
          />
          <Bar
            yAxisId="moves"
            dataKey="exits"
            name="Left"
            fill="#f87171"
            radius={[4, 4, 0, 0]}
            maxBarSize={18}
            isAnimationActive={false}
          />
          <Line
            yAxisId="hc"
            type="monotone"
            dataKey="headcount"
            name="Headcount"
            stroke="#4f46e5"
            strokeWidth={2.5}
            dot={{ r: 3 }}
            activeDot={{ r: 5 }}
            isAnimationActive={false}
          />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}

/** Donut with a centre total and a clickable legend. */
export function Donut({
  data,
  centerLabel,
  money = false,
}: {
  data: Slice[];
  centerLabel?: string;
  money?: boolean;
}) {
  const total = data.reduce((s, d) => s + d.value, 0);
  if (!total) return <Empty />;
  const shown = data.filter((d) => d.value > 0);
  return (
    <div className="@container">
      <div className="flex flex-col items-center gap-4 @min-[400px]:flex-row">
        <div className="relative h-40 w-40 shrink-0">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={shown}
                dataKey="value"
                nameKey="label"
                innerRadius="64%"
                outerRadius="100%"
                paddingAngle={shown.length > 1 ? 2 : 0}
                stroke="none"
                isAnimationActive={false}
              >
                {shown.map((d) => (
                  <Cell key={d.label} fill={d.color} />
                ))}
              </Pie>
              <Tooltip
                contentStyle={TIP}
                formatter={(v) => [
                  money
                    ? inr(Number(v))
                    : `${v} (${Math.round((Number(v) / total) * 100)}%)`,
                  "",
                ]}
              />
            </PieChart>
          </ResponsiveContainer>
          <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
            <span className="text-2xl font-semibold text-slate-900">
              {money ? compactInr(total) : total}
            </span>
            {centerLabel && (
              <span className="text-[11px] text-slate-500">{centerLabel}</span>
            )}
          </div>
        </div>
        <ul className="w-full min-w-0 space-y-1.5 text-sm">
          {data.map((d) => {
            const inner = (
              <>
                <span
                  className="h-2.5 w-2.5 shrink-0 rounded-full"
                  style={{ backgroundColor: d.color }}
                />
                <span className="min-w-0 flex-1 truncate text-slate-600">
                  {d.label}
                </span>
                <span className="font-semibold tabular-nums text-slate-800">
                  {money ? compactInr(d.value) : d.value}
                </span>
                <span className="w-10 text-right text-xs tabular-nums text-slate-400">
                  {Math.round((d.value / total) * 100)}%
                </span>
              </>
            );
            return (
              <li key={d.label}>
                {d.href ? (
                  <Link
                    href={d.href}
                    className="-mx-1.5 flex items-center gap-2 rounded px-1.5 py-0.5 hover:bg-slate-50"
                  >
                    {inner}
                  </Link>
                ) : (
                  <div className="flex items-center gap-2 py-0.5">{inner}</div>
                )}
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}

/** Horizontal bars, one row per label (departments, locations, pipeline stages). */
export function HBars({
  data,
  max = 8,
  money = false,
  empty,
}: {
  data: Slice[];
  max?: number;
  money?: boolean;
  empty?: string;
}) {
  const rows = data.slice(0, max);
  const top = Math.max(...rows.map((d) => d.value), 0);
  if (!rows.length || !top) return <Empty text={empty} />;
  return (
    <ul className="space-y-2.5">
      {rows.map((d) => (
        <li key={d.label}>
          <div className="mb-1 flex items-baseline justify-between gap-3 text-sm">
            <span className="min-w-0 truncate text-slate-600">{d.label}</span>
            <span className="font-semibold tabular-nums text-slate-800">
              {money ? inr(d.value) : d.value}
            </span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-slate-100">
            <div
              className="h-full rounded-full"
              style={{
                width: `${Math.max((d.value / top) * 100, d.value ? 3 : 0)}%`,
                backgroundColor: d.color ?? "#4f46e5",
              }}
            />
          </div>
        </li>
      ))}
      {data.length > max && (
        <li className="text-xs text-slate-400">+{data.length - max} more</li>
      )}
    </ul>
  );
}

/** Stacked monthly bars (leave days by type, claim amounts by status). */
export function StackedBars({
  data,
  money = false,
  unit = "",
  empty,
}: {
  data: Stacked;
  money?: boolean;
  unit?: string;
  empty?: string;
}) {
  if (!data.series.length) return <Empty text={empty} />;
  return (
    <div className="h-64 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart
          data={data.rows}
          margin={{ top: 8, right: 4, left: money ? 0 : -18, bottom: 0 }}
        >
          <CartesianGrid vertical={false} stroke={GRID} />
          <XAxis
            dataKey="month"
            tickLine={false}
            axisLine={false}
            tick={AXIS}
          />
          <YAxis
            allowDecimals={false}
            tickLine={false}
            axisLine={false}
            tick={AXIS}
            tickFormatter={money ? (v) => compactInr(Number(v)) : undefined}
          />
          <Tooltip
            contentStyle={TIP}
            cursor={{ fill: "rgba(79,70,229,0.06)" }}
            formatter={(v, name) => [
              money ? inr(Number(v)) : `${v}${unit}`,
              name,
            ]}
          />
          <Legend
            iconType="circle"
            iconSize={8}
            wrapperStyle={{ fontSize: 12, paddingTop: 4 }}
          />
          {data.series.map((s, i) => (
            <Bar
              key={s.key}
              dataKey={s.key}
              name={s.label}
              stackId="a"
              fill={s.color}
              maxBarSize={36}
              isAnimationActive={false}
              radius={
                i === data.series.length - 1 ? [4, 4, 0, 0] : [0, 0, 0, 0]
              }
            />
          ))}
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

/** Monthly payroll cost (net pay) as an area. */
export function PayrollArea({
  data,
}: {
  data: { month: string; net: number | null; gross: number | null; people: number }[];
}) {
  if (!data.some((d) => d.net))
    return <Empty text="No payslips published in the last 6 months" />;
  return (
    <div className="h-64 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart
          data={data}
          margin={{ top: 8, right: 4, left: 0, bottom: 0 }}
        >
          <defs>
            <linearGradient id="netFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#4f46e5" stopOpacity={0.3} />
              <stop offset="100%" stopColor="#4f46e5" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid vertical={false} stroke={GRID} />
          <XAxis
            dataKey="month"
            tickLine={false}
            axisLine={false}
            tick={AXIS}
          />
          <YAxis
            tickLine={false}
            axisLine={false}
            tick={AXIS}
            tickFormatter={(v) => compactInr(Number(v))}
          />
          <Tooltip
            contentStyle={TIP}
            formatter={(v, name) => [inr(Number(v)), name]}
            labelFormatter={(l, p) =>
              `${l} · ${p?.[0]?.payload?.people ?? 0} payslips`
            }
          />
          <Area
            type="monotone"
            dataKey="gross"
            name="Gross"
            stroke="#a5b4fc"
            strokeWidth={1.5}
            fill="none"
            isAnimationActive={false}
          />
          <Area
            type="monotone"
            dataKey="net"
            name="Net pay"
            stroke="#4f46e5"
            strokeWidth={2.5}
            fill="url(#netFill)"
            isAnimationActive={false}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

/** Segmented progress bar with a legend (review cycle progress, learning completion). */
export function SegmentBar({ data, empty }: { data: Slice[]; empty?: string }) {
  const total = data.reduce((s, d) => s + d.value, 0);
  if (!total) return <Empty h="h-24" text={empty} />;
  return (
    <div className="@container">
      <div className="flex h-3 overflow-hidden rounded-full bg-slate-100">
        {data.map((d) =>
          d.value ? (
            <div
              key={d.label}
              title={`${d.label}: ${d.value}`}
              style={{
                width: `${(d.value / total) * 100}%`,
                backgroundColor: d.color,
              }}
            />
          ) : null,
        )}
      </div>
      <ul className="mt-3 grid grid-cols-1 gap-1.5 text-sm @min-[480px]:grid-cols-3">
        {data.map((d) => (
          <li key={d.label} className="flex items-center gap-2">
            <span
              className="h-2.5 w-2.5 rounded-full"
              style={{ backgroundColor: d.color }}
            />
            <span className="text-slate-600">{d.label}</span>
            <span className="ml-auto font-semibold tabular-nums text-slate-800 @min-[480px]:ml-1">
              {d.value}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
