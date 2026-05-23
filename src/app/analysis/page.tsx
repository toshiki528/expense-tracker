"use client";

import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/lib/supabase";
import type { PersonalExpense, PersonalCategory, WarikanExpense } from "@/lib/supabase";
import { getCurrentPeriod, getAdjacentPeriod } from "@/lib/salary-cycle";
import { getOrCreateSnapshot } from "@/lib/snapshot";
import dynamic from "next/dynamic";

const Charts = dynamic(() => import("@/components/AnalysisCharts"), { ssr: false });

type AnyExpense = (PersonalExpense | WarikanExpense) & { source?: "warikan" };

const SYNC_ICON_MAP: Record<string, string> = {
  "共通食費": "🍚",
  "共通日用品": "🧴",
  "共通医療品": "🏥",
  "個人消費": "🙋",
};

async function fetchWarikanForPeriod(start: string, end: string): Promise<WarikanExpense[]> {
  const { data: receipts } = await supabase.from("receipts").select("*")
    .gte("date", start).lte("date", end);
  const wExpenses: WarikanExpense[] = [];
  if (receipts) {
    for (const r of receipts) {
      const foodShare = Math.floor(r.shared_total / 2);
      if (foodShare > 0) {
        wExpenses.push({
          id: `w-food-${r.id}`,
          amount: foodShare,
          category: "共通食費",
          memo: r.store_name,
          expense_date: r.date,
          source: "warikan",
        });
      }
      const dailyShare = Math.floor((r.daily_items_total || 0) / 2);
      if (dailyShare > 0) {
        wExpenses.push({
          id: `w-daily-${r.id}`,
          amount: dailyShare,
          category: "共通日用品",
          memo: r.store_name,
          expense_date: r.date,
          source: "warikan",
        });
      }
      const medicalShare = Math.floor((r.medical_items_total || 0) / 2);
      if (medicalShare > 0) {
        wExpenses.push({
          id: `w-medical-${r.id}`,
          amount: medicalShare,
          category: "共通医療品",
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

    // Use snapshot dates for current period
    const snap = await getOrCreateSnapshot(period.year, period.month);
    const currentStart = snap.start_date;
    const currentEnd = snap.end_date;

    const prev = getAdjacentPeriod(period.year, period.month, -1);

    const [{ data: exp }, { data: prevExp }, { data: cats }] = await Promise.all([
      supabase.from("personal_expenses").select("*")
        .gte("expense_date", currentStart).lte("expense_date", currentEnd)
        .order("expense_date", { ascending: false }),
      supabase.from("personal_expenses").select("*")
        .gte("expense_date", prev.start).lte("expense_date", prev.end),
      supabase.from("personal_categories").select("*").eq("is_active", true).order("sort_order"),
    ]);

    const [wExp, wPrevExp] = await Promise.all([
      fetchWarikanForPeriod(currentStart, currentEnd),
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
        <div className="animate-spin rounded-full h-8 w-8 border-b-2" style={{ borderColor: "var(--accent)" }} />
      </div>
    );
  }

  return (
    <div className="space-y-6 pb-4">
      {/* Period Selector */}
      <div className="flex items-center justify-between px-2">
        <button onClick={() => navigate(-1)} className="text-xl px-3 py-1" style={{ color: "var(--warm-gray-400)" }}>‹</button>
        <h1 className="text-sm font-medium tracking-wide" style={{ color: "var(--ink)" }}>{period.label}</h1>
        <button onClick={() => navigate(1)} className="text-xl px-3 py-1" style={{ color: "var(--warm-gray-400)" }}>›</button>
      </div>

      <Charts
        catBreakdown={catBreakdown}
        totalSpent={totalSpent}
        monthlyTrend={monthlyTrend}
      />

      {/* マネ吉 AI Comment */}
      <div className="rounded-lg overflow-hidden" style={{ backgroundColor: "var(--cream)", border: "1px solid var(--cream-accent)" }}>
        <div className="flex">
          <div className="w-1 shrink-0" style={{ backgroundColor: "var(--accent)" }} />
          <div className="flex-1 p-5">
            <div className="flex items-center gap-2 mb-3">
              <span className="text-2xl">🐥</span>
              <div>
                <h2 className="text-sm font-medium" style={{ color: "var(--ink)" }}>マネ吉のひとこと</h2>
                <p className="text-[10px] font-light" style={{ color: "var(--warm-gray-500)" }}>AIファイナンシャルパートナー</p>
              </div>
            </div>
            {aiComment ? (
              <>
                <div className="rounded p-3 text-sm leading-relaxed whitespace-pre-wrap" style={{ backgroundColor: "var(--bg-card)", color: "var(--ink-light)" }}>
                  {aiComment}
                </div>
                <button
                  onClick={fetchAiComment}
                  disabled={aiLoading}
                  className="mt-3 w-full py-2 rounded text-xs font-light transition-colors"
                  style={{ backgroundColor: "var(--cream-accent)", color: "var(--ink-light)" }}
                >
                  {aiLoading ? "分析中..." : "もう一度聞く"}
                </button>
              </>
            ) : (
              <button
                onClick={fetchAiComment}
                disabled={aiLoading}
                className="w-full py-3 rounded text-sm font-medium transition-all disabled:opacity-50"
                style={{ backgroundColor: "var(--cream-accent)", color: "var(--ink-light)" }}
              >
                {aiLoading ? (
                  <span className="flex items-center justify-center gap-2">
                    <span className="animate-spin rounded-full h-4 w-4 border-b-2" style={{ borderColor: "var(--ink-light)" }} />
                    分析中...
                  </span>
                ) : (
                  "🐥 マネ吉に聞いてみる"
                )}
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Month Comparison */}
      <div className="card p-5">
        <h2 className="text-xs font-light tracking-widest mb-4" style={{ color: "var(--warm-gray-400)" }}>前月比較</h2>
        {catBreakdown.length === 0 ? (
          <p className="text-sm text-center py-3" style={{ color: "var(--warm-gray-300)" }}>データなし</p>
        ) : (
          <div className="space-y-5">
            {catBreakdown.map((cat) => {
              const diff = cat.spent - cat.prevSpent;
              return (
                <div key={cat.name}>
                  <div className="text-sm mb-1" style={{ color: "var(--warm-gray-600)" }}>{cat.icon} {cat.name}</div>
                  <div className="font-amount text-xl font-bold" style={{ color: "var(--ink)" }}>¥{cat.spent.toLocaleString()}</div>
                  <div className="text-xs mt-0.5" style={{ color: "var(--warm-gray-400)" }}>
                    <span style={{ color: diff > 0 ? "var(--error)" : diff < 0 ? "var(--accent)" : "var(--warm-gray-400)" }}>
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
      <div className="card p-5">
        <h2 className="text-xs font-light tracking-widest mb-4" style={{ color: "var(--warm-gray-400)" }}>支出一覧</h2>

        {/* Filters */}
        <div className="flex gap-2 mb-4 overflow-x-auto pb-1">
          <button
            onClick={() => setFilter((f) => ({ ...f, category: "" }))}
            className="text-xs px-3 py-1.5 rounded-full whitespace-nowrap transition-colors"
            style={{
              backgroundColor: !filter.category ? "var(--accent)" : "var(--warm-gray-50)",
              color: !filter.category ? "#FFFFFF" : "var(--warm-gray-600)",
              border: !filter.category ? "none" : "1px solid var(--border)",
            }}
          >
            全て
          </button>
          {categories.map((cat) => (
            <button
              key={cat.id}
              onClick={() => setFilter((f) => ({ ...f, category: cat.name }))}
              className="text-xs px-3 py-1.5 rounded-full whitespace-nowrap transition-colors"
              style={{
                backgroundColor: filter.category === cat.name ? "var(--accent)" : "var(--warm-gray-50)",
                color: filter.category === cat.name ? "#FFFFFF" : "var(--warm-gray-600)",
                border: filter.category === cat.name ? "none" : "1px solid var(--border)",
              }}
            >
              {cat.icon}{cat.name}
            </button>
          ))}
        </div>

        {filteredExpenses.length === 0 ? (
          <p className="text-sm text-center py-6" style={{ color: "var(--warm-gray-300)" }}>該当する支出なし</p>
        ) : (() => {
          const grouped: Record<string, AnyExpense[]> = {};
          for (const exp of filteredExpenses) {
            if (!grouped[exp.expense_date]) grouped[exp.expense_date] = [];
            grouped[exp.expense_date].push(exp);
          }
          const sortedDates = Object.keys(grouped).sort((a, b) => b.localeCompare(a));
          const DAYS = ["日", "月", "火", "水", "木", "金", "土"];

          return (
            <div className="space-y-4">
              {sortedDates.map((dateStr) => {
                const d = new Date(dateStr + "T00:00:00");
                const dateLabel = `${d.getMonth() + 1}月${d.getDate()}日（${DAYS[d.getDay()]}）`;
                const dayTotal = grouped[dateStr].reduce((s, e) => s + e.amount, 0);

                return (
                  <div key={dateStr}>
                    <div className="flex justify-between items-center rounded px-3 py-1.5 mb-1" style={{ backgroundColor: "var(--warm-gray-50)" }}>
                      <span className="text-xs font-medium" style={{ color: "var(--warm-gray-600)" }}>{dateLabel}</span>
                      <span className="text-xs font-amount font-semibold" style={{ color: "var(--ink-light)" }}>-¥{dayTotal.toLocaleString()}</span>
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
                            <div className="flex items-center justify-between py-2.5 px-1 transition-colors">
                              <div className="flex items-center gap-3">
                                <span className="text-lg">{cat?.icon || SYNC_ICON_MAP[exp.category] || "📦"}</span>
                                <div>
                                  <p className="text-sm" style={{ color: "var(--ink-light)" }}>{exp.memo || exp.category}</p>
                                  <p className="text-xs" style={{ color: "var(--warm-gray-400)" }}>
                                    {isWarikan ? (
                                      <span style={{ color: "var(--accent)" }}>ワリカンから同期</span>
                                    ) : (
                                      "payment_method" in exp && <span>{PAYMENT_LABELS[(exp as PersonalExpense).payment_method] || (exp as PersonalExpense).payment_method}</span>
                                    )}
                                  </p>
                                </div>
                              </div>
                              <span className="font-amount text-sm font-semibold" style={{ color: "var(--ink)" }}>-¥{exp.amount.toLocaleString()}</span>
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
        <div className="fixed top-4 left-1/2 toast-slide-in z-50 text-sm font-medium px-6 py-3 rounded-lg"
          style={{ backgroundColor: "var(--ink)", color: "#FFFFFF", boxShadow: "0 4px 20px rgba(0,0,0,0.15)" }}>
          ワリカンアプリで変更してください
        </div>
      )}

      {/* Edit Modal */}
      {editingExpense && (
        <div className="fixed inset-0 bg-black/40 flex items-end justify-center z-50" onClick={closeEditModal}>
          <div className="bg-white rounded-t-lg w-full max-w-lg p-5 space-y-4 max-h-[85vh] overflow-y-auto" style={{ border: "1px solid var(--border)", borderBottom: "none" }} onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-1">
              <h2 className="text-base font-medium" style={{ color: "var(--ink)" }}>支出を編集</h2>
              <button onClick={closeEditModal} className="text-sm" style={{ color: "var(--warm-gray-400)" }}>✕</button>
            </div>

            {/* Amount */}
            <div>
              <label className="text-xs font-light tracking-wide block mb-1" style={{ color: "var(--warm-gray-400)" }}>金額</label>
              <div className="flex items-center gap-2">
                <span className="font-amount text-lg" style={{ color: "var(--warm-gray-300)" }}>¥</span>
                <input
                  type="number"
                  inputMode="numeric"
                  value={editAmount}
                  onChange={(e) => setEditAmount(e.target.value)}
                  className="flex-1 font-amount font-extrabold bg-transparent outline-none"
                  style={{ fontSize: "28px", color: "var(--ink)" }}
                />
              </div>
            </div>

            {/* Category */}
            <div>
              <label className="text-xs font-light tracking-wide block mb-2" style={{ color: "var(--warm-gray-400)" }}>カテゴリ</label>
              <div className="grid grid-cols-3 gap-2">
                {categories.map((cat) => (
                  <button
                    key={cat.id}
                    onClick={() => setEditCategory(cat.name)}
                    className="py-2.5 rounded text-xs font-medium transition-all relative"
                    style={{
                      backgroundColor: editCategory === cat.name ? "var(--accent-light)" : "var(--warm-gray-50)",
                      color: editCategory === cat.name ? "var(--accent-dark)" : "var(--warm-gray-600)",
                      border: editCategory === cat.name ? "1px solid var(--accent-muted)" : "1px solid transparent",
                    }}
                  >
                    <span className="text-lg block mb-0.5">{cat.icon}</span>
                    {cat.name}
                  </button>
                ))}
              </div>
            </div>

            {/* Payment Method */}
            <div>
              <label className="text-xs font-light tracking-wide block mb-2" style={{ color: "var(--warm-gray-400)" }}>支払い方法</label>
              <div className="grid grid-cols-2 gap-2">
                {EDIT_PAYMENT_METHODS.map((pm) => (
                  <button
                    key={pm.key}
                    onClick={() => setEditPayment(pm.key)}
                    className="py-2.5 rounded text-xs font-medium transition-all"
                    style={{
                      backgroundColor: editPayment === pm.key ? "var(--accent-light)" : "var(--warm-gray-50)",
                      color: editPayment === pm.key ? "var(--accent-dark)" : "var(--warm-gray-600)",
                      border: editPayment === pm.key ? "1px solid var(--accent-muted)" : "1px solid transparent",
                    }}
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
                <label className="text-xs font-light tracking-wide block mb-1" style={{ color: "var(--warm-gray-400)" }}>日付</label>
                <input type="date" value={editDate} onChange={(e) => setEditDate(e.target.value)}
                  className="w-full text-sm rounded px-3 py-2.5 outline-none"
                  style={{ fontSize: "16px", border: "1px solid var(--border)", color: "var(--ink)" }} />
              </div>
              <div>
                <label className="text-xs font-light tracking-wide block mb-1" style={{ color: "var(--warm-gray-400)" }}>メモ</label>
                <input type="text" value={editMemo} onChange={(e) => setEditMemo(e.target.value)}
                  placeholder="メモ（任意）"
                  className="w-full text-sm rounded px-3 py-2.5 outline-none"
                  style={{ fontSize: "16px", border: "1px solid var(--border)", color: "var(--ink)" }} />
              </div>
            </div>

            {/* Save */}
            <button
              onClick={handleEditSave}
              disabled={editSaving || !editAmount || !editCategory}
              className="w-full py-3.5 text-base font-bold disabled:opacity-40 transition-all active:scale-[0.98]"
              style={{ borderRadius: "4px", backgroundColor: "var(--accent)", color: "#FFFFFF" }}
            >
              {editSaving ? "保存中..." : "保存する"}
            </button>

            {/* Delete */}
            {!showDeleteConfirm ? (
              <button
                onClick={() => setShowDeleteConfirm(true)}
                className="w-full py-2.5 rounded text-sm font-medium"
                style={{ backgroundColor: "var(--error-light)", color: "var(--error)" }}
              >
                この支出を削除
              </button>
            ) : (
              <div className="rounded p-4 space-y-3" style={{ backgroundColor: "var(--error-light)" }}>
                <p className="text-sm text-center" style={{ color: "var(--ink-light)" }}>この支出を削除しますか？</p>
                <div className="flex gap-3">
                  <button onClick={() => setShowDeleteConfirm(false)}
                    className="flex-1 py-2.5 rounded text-sm font-medium"
                    style={{ backgroundColor: "var(--warm-gray-100)", color: "var(--ink-light)" }}>
                    キャンセル
                  </button>
                  <button onClick={handleEditDelete}
                    className="flex-1 py-2.5 rounded text-sm font-medium"
                    style={{ backgroundColor: "var(--error)", color: "#FFFFFF" }}>
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
