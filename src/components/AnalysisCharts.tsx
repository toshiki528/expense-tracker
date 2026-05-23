"use client";

import { PieChart, Pie, Cell, ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip } from "recharts";

const COLORS = ["#2D8A7E", "#C4956A", "#8B9E8B", "#D4A574", "#6BB3A9", "#A0877B", "#4A9E93"];

type CatBreakdown = { name: string; icon: string; spent: number; prevSpent: number; budget: number | null };

export default function AnalysisCharts({
  catBreakdown,
  totalSpent,
  monthlyTrend,
  showPie = true,
  showTrend = true,
}: {
  catBreakdown: CatBreakdown[];
  totalSpent: number;
  monthlyTrend: { month: string; total: number }[];
  showPie?: boolean;
  showTrend?: boolean;
}) {
  const pieData = catBreakdown
    .filter((c) => c.spent > 0)
    .map((c) => ({ name: `${c.icon}${c.name}`, value: c.spent }));

  return (
    <>
      {showPie && pieData.length > 0 && (
        <div className="card p-5">
          <h2 className="text-xs font-light tracking-wide mb-3" style={{ color: "var(--warm-gray-500)" }}>カテゴリ別</h2>
          <div className="flex items-center">
            <div className="w-36 h-36">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={pieData}
                    cx="50%"
                    cy="50%"
                    innerRadius={35}
                    outerRadius={60}
                    paddingAngle={2}
                    dataKey="value"
                  >
                    {pieData.map((_, i) => (
                      <Cell key={i} fill={COLORS[i % COLORS.length]} />
                    ))}
                  </Pie>
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div className="flex-1 space-y-1.5 ml-3">
              {pieData.map((d, i) => {
                const pct = totalSpent > 0 ? Math.round((d.value / totalSpent) * 100) : 0;
                return (
                  <div key={d.name} className="flex items-center justify-between text-xs">
                    <div className="flex items-center gap-1.5">
                      <span className="w-2 h-2 rounded-full inline-block" style={{ backgroundColor: COLORS[i % COLORS.length] }} />
                      <span style={{ color: "var(--warm-gray-600)" }}>{d.name}</span>
                    </div>
                    <span className="font-amount font-semibold" style={{ color: "var(--ink)" }}>{pct}%</span>
                  </div>
                );
              })}
            </div>
          </div>
          <p className="text-center text-xs mt-2 font-amount" style={{ color: "var(--warm-gray-400)" }}>
            合計: ¥{totalSpent.toLocaleString()}
          </p>
        </div>
      )}

      {showTrend && monthlyTrend.some((m) => m.total > 0) && (
        <div className="card p-5">
          <h2 className="text-xs font-light tracking-wide mb-3" style={{ color: "var(--warm-gray-500)" }}>月間推移（6ヶ月）</h2>
          <div className="h-40">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={monthlyTrend}>
                <XAxis dataKey="month" tick={{ fontSize: 10, fill: "var(--warm-gray-400)" }} axisLine={{ stroke: "var(--border)" }} tickLine={false} />
                <YAxis tick={{ fontSize: 10, fill: "var(--warm-gray-400)" }} tickFormatter={(v) => `${Math.round(v / 1000)}k`} width={35} axisLine={false} tickLine={false} />
                <Tooltip
                  formatter={(value) => [`¥${Number(value).toLocaleString()}`, "消費"]}
                  labelFormatter={(l) => String(l)}
                  contentStyle={{ borderRadius: "8px", border: "1px solid var(--border)", boxShadow: "0 2px 8px rgba(0,0,0,0.06)", fontSize: "12px" }}
                />
                <Line type="monotone" dataKey="total" stroke="var(--accent)" strokeWidth={2} dot={{ r: 3, fill: "var(--accent)" }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}
    </>
  );
}
