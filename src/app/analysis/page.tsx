"use client";

import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/lib/supabase";
import type { PersonalExpense, PersonalCategory, WarikanExpense } from "@/lib/supabase";
import { getCurrentPeriod, getAdjacentPeriod } from "@/lib/salary-cycle";
import Link from "next/link";
import dynamic from "next/dynamic";

const Charts = dynamic(() => import("@/components/AnalysisCharts"), { ssr: false });

type AnyExpense = (PersonalExpense | WarikanExpense) & { source?: "warikan" };

async function fetchWarikanForPeriod(start: string, end: string): Promise<WarikanExpense[]> {
  const { data: receipts } = await supabase.from("receipts").select("*")
    .gte("date", start).lte("date", end);
  const wExpenses: WarikanExpense[] = [];
  if (receipts) {
    for (const r of receipts) {
      const sharedShare = Math.floor(r.shared_total / 2);
      if (sharedShare > 0) {
        wExpenses.push({
          id: `w-shared-${r.id}`,
          amount: sharedShare,
          category: "共通買い物",
          memo: r.store_name,
          expense_date: r.date,
          source: "warikan",
        });
      }
      if (r.personal_total > 0) {
        wExpenses.push({
          id: `w-personal-${r.id}`,
          amount: r.personal_total,
          category: "個人消費",
          memo: r.store_name,
          expense_date: r.date,
          source: "warikan",
        });
      }
    }
  }
  return wExpenses;
}

export default function AnalysisPage() {
  const [period, setPeriod] = useState(getCurrentPeriod());
  const [expenses, setExpenses] = useState<PersonalExpense[]>([]);
  const [warikanExpenses, setWarikanExpenses] = useState<WarikanExpense[]>([]);
  const [prevExpenses, setPrevExpenses] = useState<PersonalExpense[]>([]);
  const [prevWarikanExpenses, setPrevWarikanExpenses] = useState<WarikanExpense[]>([]);
  const [categories, setCategories] = useState<PersonalCategory[]>([]);
  const [monthlyTrend, setMonthlyTrend] = useState<{ month: string; total: number }[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<{ category: string; payment: string }>({ category: "", payment: "" });
  const [aiComment, setAiComment] = useState<string | null>(null);
  const [aiLoading, setAiLoading] = useState(false);

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

    const [wExp, wPrevExp] = await Promise.all([
      fetchWarikanForPeriod(period.start, period.end),
      fetchWarikanForPeriod(prev.start, prev.end),
    ]);

    // 6-month trend (include warikan)
    const trend: { month: string; total: number }[] = [];
    let tp = period;
    for (let i = 0; i < 6; i++) {
      if (i > 0) tp = getAdjacentPeriod(tp.year, tp.month, -1);
      const [{ data: manualData }, wData] = await Promise.all([
        supabase.from("personal_expenses").select("amount")
          .gte("expense_date", tp.start).lte("expense_date", tp.end),
        fetchWarikanForPeriod(tp.start, tp.end),
      ]);
      const manualTotal = manualData ? manualData.reduce((s, e) => s + e.amount, 0) : 0;
      const warikanTotal = wData.reduce((s, e) => s + e.amount, 0);
      trend.unshift({
        month: `${tp.month}月`,
        total: manualTotal + warikanTotal,
      });
    }

    setExpenses(exp || []);
    setWarikanExpenses(wExp);
    setPrevExpenses(prevExp || []);
    setPrevWarikanExpenses(wPrevExp);
    setCategories(cats || []);
    setMonthlyTrend(trend);
    setAiComment(null);
    setLoading(false);
  }, [period]);

  useEffect(() => { loadData(); }, [loadData]);

  const navigate = (dir: -1 | 1) => setPeriod(getAdjacentPeriod(period.year, period.month, dir));

  // All expenses merged
  const allExpenses: AnyExpense[] = [
    ...expenses.map((e) => ({ ...e, source: undefined as "warikan" | undefined })),
    ...warikanExpenses,
  ].sort((a, b) => b.expense_date.localeCompare(a.expense_date));

  // Category breakdown (includes warikan)
  const catBreakdown = categories.map((cat) => {
    const manual = expenses.filter((e) => e.category === cat.name).reduce((s, e) => s + e.amount, 0);
    const warikan = warikanExpenses.filter((e) => e.category === cat.name).reduce((s, e) => s + e.amount, 0);
    const spent = manual + warikan;
    const prevManual = prevExpenses.filter((e) => e.category === cat.name).reduce((s, e) => s + e.amount, 0);
    const prevWarikan = prevWarikanExpenses.filter((e) => e.category === cat.name).reduce((s, e) => s + e.amount, 0);
    const prevSpent = prevManual + prevWarikan;
    return { name: cat.name, icon: cat.icon, spent, prevSpent, budget: cat.budget_amount };
  }).filter((c) => c.spent > 0 || c.prevSpent > 0);

  const totalSpent = expenses.reduce((s, e) => s + e.amount, 0) + warikanExpenses.reduce((s, e) => s + e.amount, 0);

  // Filtered expenses
  const filteredExpenses = allExpenses.filter((e) => {
    if (filter.category && e.category !== filter.category) return false;
    if (filter.payment) {
      if (e.source === "warikan") return false;
      if ("payment_method" in e && e.payment_method !== filter.payment) return false;
    }
    return true;
  });

  const PAYMENT_LABELS: Record<string, string> = {
    cash: "💴現金等", credit: "💳クレカ",
  };

  const fetchAiComment = async () => {
    setAiLoading(true);
    setAiComment(null);
    try {
      const res = await fetch("/api/ai-comment", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          period: period.label,
          totalSpent,
          catBreakdown: catBreakdown.map((c) => ({
            name: c.name, icon: c.icon, spent: c.spent, prevSpent: c.prevSpent, budget: c.budget,
          })),
          monthlyTrend,
        }),
      });
      const data = await res.json();
      setAiComment(data.comment || "コメントを取得できませんでした。");
    } catch {
      setAiComment("エラーが発生しました。もう一度お試しください。");
    }
    setAiLoading(false);
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

      {/* マネ吉 AI Comment */}
      <div className="bg-amber-50 rounded-2xl p-4 shadow-sm">
        <div className="flex items-center gap-2 mb-3">
          <span className="text-2xl">🐥</span>
          <div>
            <h2 className="text-sm font-bold text-amber-800">マネ吉のひとこと</h2>
            <p className="text-[10px] text-amber-600">AIファイナンシャルパートナー</p>
          </div>
        </div>
        {aiComment ? (
          <>
            <div className="bg-white rounded-xl p-3 text-sm text-gray-700 leading-relaxed whitespace-pre-wrap">
              {aiComment}
            </div>
            <button
              onClick={fetchAiComment}
              disabled={aiLoading}
              className="mt-2 w-full py-2 rounded-lg text-xs text-amber-700 bg-amber-100 active:bg-amber-200"
            >
              {aiLoading ? "分析中..." : "もう一度聞く"}
            </button>
          </>
        ) : (
          <button
            onClick={fetchAiComment}
            disabled={aiLoading}
            className="w-full py-3 rounded-xl text-sm font-bold bg-amber-100 text-amber-800 active:bg-amber-200 transition disabled:opacity-50"
          >
            {aiLoading ? (
              <span className="flex items-center justify-center gap-2">
                <span className="animate-spin rounded-full h-4 w-4 border-b-2 border-amber-800" />
                分析中...
              </span>
            ) : (
              "🐥 マネ吉に聞いてみる"
            )}
          </button>
        )}
      </div>

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
        ) : (() => {
          const grouped: Record<string, AnyExpense[]> = {};
          for (const exp of filteredExpenses) {
            if (!grouped[exp.expense_date]) grouped[exp.expense_date] = [];
            grouped[exp.expense_date].push(exp);
          }
          const sortedDates = Object.keys(grouped).sort((a, b) => b.localeCompare(a));
          const DAYS = ["日", "月", "火", "水", "木", "金", "土"];

          return (
            <div className="space-y-3">
              {sortedDates.map((dateStr) => {
                const d = new Date(dateStr + "T00:00:00");
                const dateLabel = `${d.getMonth() + 1}月${d.getDate()}日（${DAYS[d.getDay()]}）`;
                const dayTotal = grouped[dateStr].reduce((s, e) => s + e.amount, 0);

                return (
                  <div key={dateStr}>
                    <div className="flex justify-between items-center bg-gray-50 rounded-lg px-3 py-1.5 mb-1">
                      <span className="text-xs font-bold text-gray-600">{dateLabel}</span>
                      <span className="text-xs font-bold text-gray-700">合計: -¥{dayTotal.toLocaleString()}</span>
                    </div>
                    <div>
                      {grouped[dateStr].map((exp) => {
                        const cat = categories.find((c) => c.name === exp.category);
                        const isWarikan = exp.source === "warikan";
                        const inner = (
                          <div className="flex items-center justify-between py-1.5 px-1 border-b border-gray-50 last:border-0">
                            <div className="flex items-center gap-2">
                              <span className="text-lg">{cat?.icon || "📦"}</span>
                              <div>
                                <p className="text-sm text-gray-700">{exp.memo || exp.category}</p>
                                <p className="text-xs text-gray-400">
                                  {isWarikan ? (
                                    <span className="text-emerald-500">ワリカンから同期</span>
                                  ) : (
                                    "payment_method" in exp && <span>{PAYMENT_LABELS[(exp as PersonalExpense).payment_method] || (exp as PersonalExpense).payment_method}</span>
                                  )}
                                </p>
                              </div>
                            </div>
                            <span className="text-sm font-bold text-gray-700">-¥{exp.amount.toLocaleString()}</span>
                          </div>
                        );
                        return isWarikan ? (
                          <div key={exp.id}>{inner}</div>
                        ) : (
                          <Link key={exp.id} href={`/record/${exp.id}`}>{inner}</Link>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          );
        })()}
      </div>
    </div>
  );
}
