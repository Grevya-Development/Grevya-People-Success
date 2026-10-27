"use client";

import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

export type BarDatum = { label: string; value: number; color?: string };

/** Simple vertical bar chart (rating distribution, goals per status). */
export function SimpleBarChart({ data, color = "#4a8ad0", unit = "" }: { data: BarDatum[]; color?: string; unit?: string }) {
  return (
    <div className="h-56 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 8, left: -18, bottom: 0 }}>
          <CartesianGrid vertical={false} stroke="#eef1f6" />
          <XAxis dataKey="label" tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: "#64748b" }} interval={0} />
          <YAxis allowDecimals={false} tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: "#94a3b8" }} />
          <Tooltip
            cursor={{ fill: "rgba(74,138,208,0.08)" }}
            contentStyle={{ borderRadius: 8, border: "1px solid #e2e8f0", fontSize: 12 }}
            formatter={(v) => [`${v}${unit}`, "Count"]}
          />
          <Bar dataKey="value" radius={[6, 6, 0, 0]} maxBarSize={48}>
            {data.map((d) => (
              <Cell key={d.label} fill={d.color ?? color} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
