"use client";

import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

type Row = { title: string; completion: number; completed: number; enrolled: number };

function ChartTooltip({ active, payload }: { active?: boolean; payload?: { payload: Row }[] }) {
  if (!active || !payload?.length) return null;
  const r = payload[0].payload;
  return (
    <div className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs shadow-md">
      <p className="mb-1 max-w-[240px] font-medium text-slate-800">{r.title}</p>
      <p className="text-slate-600">
        <span className="font-semibold text-slate-900">{r.completion}%</span> completed · {r.completed} of {r.enrolled}
      </p>
    </div>
  );
}

/** Completion % per course (single series, one hue; the table below is the data view). */
export function CompletionChart({ data }: { data: Row[] }) {
  const height = Math.max(160, data.length * 34 + 40);
  return (
    <div style={{ height }} className="w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} layout="vertical" margin={{ top: 4, right: 24, bottom: 4, left: 8 }} barCategoryGap={8}>
          <CartesianGrid horizontal={false} stroke="#eef2f6" />
          <XAxis type="number" domain={[0, 100]} tickFormatter={(v) => `${v}%`} tick={{ fontSize: 11, fill: "#64748b" }} axisLine={false} tickLine={false} />
          <YAxis
            type="category"
            dataKey="title"
            width={150}
            tick={{ fontSize: 11, fill: "#475569" }}
            tickFormatter={(v: string) => (v.length > 22 ? `${v.slice(0, 21)}…` : v)}
            axisLine={false}
            tickLine={false}
          />
          <Tooltip content={<ChartTooltip />} cursor={{ fill: "#f1f5f9" }} />
          <Bar dataKey="completion" fill="#3a95b3" radius={[0, 4, 4, 0]} maxBarSize={18} isAnimationActive={false} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
