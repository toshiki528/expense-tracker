"use client";

import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/lib/supabase";
import type { PersonalExpense, PersonalCategory } from "@/lib/supabase";
import { getCurrentPeriod, getAdjacentPeriod } from "@/lib/salary-cycle";
import Link from "next/link";
import dynamic from "next/dynamic";

const Charts = dynamic(() => import("@/components/AnalysisCharts"), { ssr: false });

export default function AnalysisPage() {
  const [period, setPeriod] = useState(getCurrentPeriod());
  const [expenses, setExpenses] = useState<PersonalExpense[]>([]);
  const [prevExpenses, setPrevExpenses] = useState<PersonalExpense[]>([]);
  const [categories, setCategories] = useState<PersonalCategory[]>([]);
  const [monthlyTrend, setMonthlyTrend] = useState<{ month: string; total: number }[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<{ category: string; payment: string }>({ category: "", payment: "" });

  const loadData = useCallback(async () => {
    setLoading(true);

    const prev = getAdjacentPeriod(period.year, period.month, -1);

    const [{ data: exp }, { data: prevExp }, { data: cats }] = await Promise.all([
      supabase.from("personal_expenses").select("*")
        .gte("expense_date", period.start).lte("expense_date", period.end)
        .order("expense_date", { ascending: false }),
      supabase.from("personal_expenses").select("*")
        .gte("expense_date", prev.start).lte("expense_date", prev.end),
      supabase.from("personal_categories").select("*").eq("is_active", true).order("sort_order"),
    ]);

    // 6-month trend
    const trend: { month: string; total: number }[] = [];
    let tp = period;
    for (let i = 0; i < 6; i++) {
      if (i > 0) tp = getAdjacentPeriod(tp.year, tp.month, -1);
      const { data } = await supabase.from("personal_expenses").select("amount")
        .gte("expense_date", tp.start).lte("expense_date", tp.end);
      trend.unshift({
        month: `${tp.month}月`,
        total: data ? data.reduce((s, e) => s + e.amount, 0) : 0,
      });
    }

    setExpenses(exp || []);
    setPrevExpenses(prevExp || []);
    setCategories(cats || []);
    setMonthlyTrend(trend);
    setLoading(false);
  }, [period]);

  useEffect(() => { loadData(); }, [loadData]);

  const navigate = (dir: -1 | 1) => setPeriod(getAdjacentPeriod(period.year, period.month, dir));

  // Category breakdown
  const catBreakdown = categories.map((cat) => {
    const spent = expenses.filter((e) => e.category === cat.name).reduce((s, e) => s + e.amount, 0);
    const prevSpent = prevExpenses.filter((e) => e.category === cat.name).reduce((s, e) => s + e.amount, 0);
    return { name: cat.name, icon: cat.icon, spent, prevSpent, budget: cat.budget_amount };
  }).filter((c) => c.spent > 0 || c.prevSpent > 0);

  const totalSpent = expenses.reduce((s, e) => s + e.amount, 0);

  // Filtered expenses
  const filteredExpenses = expenses.filter((e) => {
    if (filter.category && e.category !== filter.category) return false;
    if (filter.payment && e.payment_method !== filter.payment) return false;
    return true;
  });

  const PAYMENT_LABELS: Record<string, string> = {
    cash: "💴現金等", credit: "💳クレカ",
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-emerald-600" />
      </div>
    );
  }

  return (
    <div className="space-y-4 pb-4">
      {/* Period Selector */}
      <div className="flex items-center justify-between">
        <button onClick={() => navigate(-1)} className="text-2xl text-gray-400 px-2">‹</button>
        <h1 className="text-base font-bold text-gray-800">{period.label}</h1>
        <button onClick={() => navigate(1)} className="text-2xl text-gray-400 px-2">›</button>
      </div>

      <Charts
        catBreakdown={catBreakdown}
        totalSpent={totalSpent}
        monthlyTrend={monthlyTrend}
      />

      {/* Month Comparison */}
      <div className="bg-white rounded-2xl p-4 shadow-sm">
        <h2 className="text-xs font-bold text-gray-500 mb-3">前月比較</h2>
        {catBreakdown.length === 0 ? (
          <p className="text-sm text-gray-400 text-center py-2">データなし</p>
        ) : (
          <div className="space-y-3">
            {catBreakdown.map((cat) => {
              const diff = cat.spent - cat.prevSpent;
              return (
                <div key={cat.name}>
                  <div className="flex justify-between text-sm mb-1">
                    <span>{cat.icon} {cat.name}</span>
                    <span className={`text-xs font-bold ${diff > 0 ? "text-red-500" : diff < 0 ? "text-emerald-500" : "text-gray-400"}`}>
                      {diff > 0 ? `↑+¥${diff.toLocaleString()}` : diff < 0 ? `↓¥${diff.toLocaleString()}` : "±0"}
                    </span>
                  </div>
                  <div className="flex gap-1 text-xs text-gray-400">
                    <span>今月: ¥{cat.spent.toLocaleString()}</span>
                    <span>/ 先月: ¥{cat.prevSpent.toLocaleString()}</span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Expense List */}
      <div className="bg-white rounded-2xl p-4 shadow-sm">
        <h2 className="text-xs font-bold text-gray-500 mb-3">支出一覧</h2>

        {/* Filters */}
        <div className="flex gap-2 mb-3 overflow-x-auto pb-1">
          <button
            onClick={() => setFilter((f) => ({ ...f, category: "" }))}
            className={`text-xs px-3 py-1 rounded-full whitespace-nowrap ${!filter.category ? "bg-emerald-600 text-white" : "bg-gray-100 text-gray-600"}`}
          >
            全て
          </button>
          {categories.map((cat) => (
            <button
              key={cat.id}
              onClick={() => setFilter((f) => ({ ...f, category: cat.name }))}
              className={`text-xs px-3 py-1 rounded-full whitespace-nowrap ${filter.category === cat.name ? "bg-emerald-600 text-white" : "bg-gray-100 text-gray-600"}`}
            >
              {cat.icon}{cat.name}
            </button>
          ))}
        </div>

        {filteredExpenses.length === 0 ? (
          <p className="text-sm text-gray-400 text-center py-4">該当する支出なし</p>
        ) : (
          <div className="space-y-1.5">
            {filteredExpenses.map((exp) => {
              const cat = categories.find((c) => c.name === exp.category);
              return (
                <Link
                  key={exp.id}
                  href={`/record/${exp.id}`}
                  className="flex items-center justify-between py-2 border-b border-gray-50 last:border-0"
                >
                  <div className="flex items-center gap-2">
                    <span className="text-lg">{cat?.icon || "📦"}</span>
                    <div>
                      <p className="text-sm text-gray-700">{exp.memo || exp.category}</p>
                      <p className="text-xs text-gray-400">{exp.expense_date} {PAYMENT_LABELS[exp.payment_method] || exp.payment_method}</p>
                    </div>
                  </div>
                  <span className="text-sm font-bold text-gray-700">-¥{exp.amount.toLocaleString()}</span>
                </Link>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
