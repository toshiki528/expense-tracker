"use client";

import { PieChart, Pie, Cell, ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip } from "recharts";

const COLORS = ["#059669", "#0ea5e9", "#f59e0b", "#ef4444", "#8b5cf6", "#ec4899", "#14b8a6"];

type CatBreakdown = { name: string; icon: string; spent: number; prevSpent: number; budget: number | null };

export default function AnalysisCharts({
  catBreakdown,
  totalSpent,
  monthlyTrend,
}: {
  catBreakdown: CatBreakdown[];
  totalSpent: number;
  monthlyTrend: { month: string; total: number }[];
}) {
  const pieData = catBreakdown
    .filter((c) => c.spent > 0)
    .map((c) => ({ name: `${c.icon}${c.name}`, value: c.spent }));

  return (
    <>
      {/* Pie Chart */}
      {pieData.length > 0 && (
        <div className="bg-white rounded-2xl p-4 shadow-sm">
          <h2 className="text-xs font-bold text-gray-500 mb-2">カテゴリ別</h2>
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
            <div className="flex-1 space-y-1 ml-2">
              {pieData.map((d, i) => {
                const pct = totalSpent > 0 ? Math.round((d.value / totalSpent) * 100) : 0;
                return (
                  <div key={d.name} className="flex items-center justify-between text-xs">
                    <div className="flex items-center gap-1">
                      <span className="w-2.5 h-2.5 rounded-full inline-block" style={{ backgroundColor: COLORS[i % COLORS.length] }} />
                      <span className="text-gray-600">{d.name}</span>
                    </div>
                    <span className="font-bold text-gray-700">{pct}%</span>
                  </div>
                );
              })}
            </div>
          </div>
          <p className="text-center text-xs text-gray-400 mt-1">合計: ¥{totalSpent.toLocaleString()}</p>
        </div>
      )}

      {/* Monthly Trend */}
      {monthlyTrend.some((m) => m.total > 0) && (
        <div className="bg-white rounded-2xl p-4 shadow-sm">
          <h2 className="text-xs font-bold text-gray-500 mb-2">月間推移（6ヶ月）</h2>
          <div className="h-40">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={monthlyTrend}>
                <XAxis dataKey="month" tick={{ fontSize: 10 }} />
                <YAxis tick={{ fontSize: 10 }} tickFormatter={(v) => `${Math.round(v / 1000)}k`} width={35} />
                <Tooltip
                  formatter={(value) => [`¥${Number(value).toLocaleString()}`, "消費"]}
                  labelFormatter={(l) => String(l)}
                />
                <Line type="monotone" dataKey="total" stroke="#059669" strokeWidth={2} dot={{ r: 4 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}
    </>
  );
}
