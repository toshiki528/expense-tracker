"use client";

import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/lib/supabase";
import type { PersonalExpense, PersonalCategory, WarikanExpense } from "@/lib/supabase";
import { getCurrentPeriod, getAdjacentPeriod } from "@/lib/salary-cycle";
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

  // Edit modal state
  const [editingExpense, setEditingExpense] = useState<PersonalExpense | null>(null);
  const [editAmount, setEditAmount] = useState("");
  const [editCategory, setEditCategory] = useState("");
  const [editPayment, setEditPayment] = useState("");
  const [editMemo, setEditMemo] = useState("");
  const [editDate, setEditDate] = useState("");
  const [editSaving, setEditSaving] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [warikanToast, setWarikanToast] = useState(false);

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

  const openEditModal = (exp: PersonalExpense) => {
    setEditingExpense(exp);
    setEditAmount(String(exp.amount));
    setEditCategory(exp.category);
    setEditPayment(exp.payment_method);
    setEditMemo(exp.memo || "");
    setEditDate(exp.expense_date);
    setShowDeleteConfirm(false);
  };

  const closeEditModal = () => {
    setEditingExpense(null);
    setShowDeleteConfirm(false);
  };

  const handleEditSave = async () => {
    if (!editingExpense || !editAmount || !editCategory) return;
    setEditSaving(true);
    await supabase.from("personal_expenses").update({
      amount: parseInt(editAmount),
      category: editCategory,
      payment_method: editPayment,
      memo: editMemo.trim() || null,
      expense_date: editDate,
      updated_at: new Date().toISOString(),
    }).eq("id", editingExpense.id);
    setEditSaving(false);
    closeEditModal();
    loadData();
  };

  const handleEditDelete = async () => {
    if (!editingExpense) return;
    await supabase.from("personal_expenses").delete().eq("id", editingExpense.id);
    closeEditModal();
    loadData();
  };

  const EDIT_PAYMENT_METHODS = [
    { key: "cash", label: "現金等", icon: "💴" },
    { key: "credit", label: "クレカ", icon: "💳" },
  ];

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
                  <div className="text-sm text-gray-700 mb-0.5">{cat.icon} {cat.name}</div>
                  <div className="text-lg font-bold text-gray-800">¥{cat.spent.toLocaleString()}</div>
                  <div className="text-xs text-gray-400">
                    <span className={diff > 0 ? "text-red-400" : diff < 0 ? "text-emerald-400" : ""}>
                      先月比 {diff > 0 ? `+¥${diff.toLocaleString()}` : diff < 0 ? `¥${diff.toLocaleString()}` : "±0"}
                    </span>
                    {" / 先月: ¥"}{cat.prevSpent.toLocaleString()}
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
                        return (
                          <button
                            key={exp.id}
                            className="w-full text-left"
                            onClick={() => {
                              if (isWarikan) {
                                setWarikanToast(true);
                                setTimeout(() => setWarikanToast(false), 2500);
                              } else {
                                openEditModal(exp as PersonalExpense);
                              }
                            }}
                          >
                            <div className="flex items-center justify-between py-1.5 px-1 border-b border-gray-50 last:border-0 active:bg-gray-50 transition">
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
                          </button>
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

      {/* Warikan toast */}
      {warikanToast && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 bg-gray-800 text-white px-6 py-3 rounded-full text-sm font-bold shadow-xl z-50">
          ワリカンアプリで変更してください
        </div>
      )}

      {/* Edit Modal */}
      {editingExpense && (
        <div className="fixed inset-0 bg-black/50 flex items-end justify-center z-50" onClick={closeEditModal}>
          <div className="bg-white rounded-t-2xl w-full max-w-lg p-5 space-y-4 max-h-[85vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-1">
              <h2 className="text-base font-bold text-gray-800">支出を編集</h2>
              <button onClick={closeEditModal} className="text-sm text-gray-400">✕</button>
            </div>

            {/* Amount */}
            <div>
              <label className="text-xs text-gray-500 block mb-1">金額</label>
              <div className="flex items-center gap-2">
                <span className="text-xl text-gray-400">¥</span>
                <input
                  type="number"
                  inputMode="numeric"
                  value={editAmount}
                  onChange={(e) => setEditAmount(e.target.value)}
                  className="flex-1 text-2xl font-black text-gray-800 bg-transparent outline-none"
                  style={{ fontSize: "28px" }}
                />
              </div>
            </div>

            {/* Category */}
            <div>
              <label className="text-xs text-gray-500 block mb-2">カテゴリ</label>
              <div className="grid grid-cols-3 gap-2">
                {categories.map((cat) => (
                  <button
                    key={cat.id}
                    onClick={() => setEditCategory(cat.name)}
                    className={`py-2.5 rounded-xl text-xs font-bold transition ${
                      editCategory === cat.name
                        ? "bg-emerald-600 text-white shadow-md"
                        : "bg-gray-50 text-gray-700"
                    }`}
                  >
                    <span className="text-lg block mb-0.5">{cat.icon}</span>
                    {cat.name}
                  </button>
                ))}
              </div>
            </div>

            {/* Payment Method */}
            <div>
              <label className="text-xs text-gray-500 block mb-2">支払い方法</label>
              <div className="grid grid-cols-2 gap-2">
                {EDIT_PAYMENT_METHODS.map((pm) => (
                  <button
                    key={pm.key}
                    onClick={() => setEditPayment(pm.key)}
                    className={`py-2.5 rounded-xl text-xs font-bold transition ${
                      editPayment === pm.key
                        ? "bg-emerald-600 text-white"
                        : "bg-gray-50 text-gray-600"
                    }`}
                  >
                    <span className="text-base block">{pm.icon}</span>
                    {pm.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Date & Memo */}
            <div className="space-y-3">
              <div>
                <label className="text-xs text-gray-500 block mb-1">日付</label>
                <input type="date" value={editDate} onChange={(e) => setEditDate(e.target.value)}
                  className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2.5" style={{ fontSize: "16px" }} />
              </div>
              <div>
                <label className="text-xs text-gray-500 block mb-1">メモ</label>
                <input type="text" value={editMemo} onChange={(e) => setEditMemo(e.target.value)}
                  placeholder="メモ（任意）"
                  className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2.5" style={{ fontSize: "16px" }} />
              </div>
            </div>

            {/* Save */}
            <button
              onClick={handleEditSave}
              disabled={editSaving || !editAmount || !editCategory}
              className="w-full py-3.5 rounded-2xl text-base font-black bg-emerald-600 text-white disabled:opacity-40 shadow-lg"
            >
              {editSaving ? "保存中..." : "保存する"}
            </button>

            {/* Delete */}
            {!showDeleteConfirm ? (
              <button
                onClick={() => setShowDeleteConfirm(true)}
                className="w-full py-2.5 rounded-2xl text-sm font-bold text-red-500 bg-red-50"
              >
                この支出を削除
              </button>
            ) : (
              <div className="bg-red-50 rounded-2xl p-4 space-y-3">
                <p className="text-sm text-gray-700 text-center">この支出を削除しますか？</p>
                <div className="flex gap-3">
                  <button onClick={() => setShowDeleteConfirm(false)}
                    className="flex-1 py-2.5 rounded-xl text-sm font-bold bg-gray-100 text-gray-700">
                    キャンセル
                  </button>
                  <button onClick={handleEditDelete}
                    className="flex-1 py-2.5 rounded-xl text-sm font-bold bg-red-500 text-white">
                    削除する
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
