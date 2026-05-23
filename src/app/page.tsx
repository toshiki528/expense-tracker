"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { supabase } from "@/lib/supabase";
import type { PersonalExpense, PersonalSettings, PersonalCategory, MonthlySnapshot, WarikanExpense } from "@/lib/supabase";
import { getCurrentPeriod, getAdjacentPeriod, getRemainingDays } from "@/lib/salary-cycle";
import { getOrCreateSnapshot, resyncSnapshot, lockSnapshot, unlockSnapshot, updateSalaryPayDate } from "@/lib/snapshot";
import Link from "next/link";

type AnyExpense = (PersonalExpense | WarikanExpense) & { source?: "warikan" };

const SYNC_ICON_MAP: Record<string, string> = {
  "共通食費": "🍚",
  "共通日用品": "🧴",
  "共通医療品": "🏥",
  "個人消費": "🙋",
};

export default function HomePage() {
  const [period, setPeriod] = useState(getCurrentPeriod());
  const [settings, setSettings] = useState<PersonalSettings | null>(null);
  const [expenses, setExpenses] = useState<PersonalExpense[]>([]);
  const [warikanExpenses, setWarikanExpenses] = useState<WarikanExpense[]>([]);
  const [categories, setCategories] = useState<PersonalCategory[]>([]);
  const [snapshot, setSnapshot] = useState<MonthlySnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [editingIncome, setEditingIncome] = useState(false);
  const [incomeInput, setIncomeInput] = useState("");
  const incomeRef = useRef<HTMLInputElement>(null);

  // Salary date editing
  const [editingSalaryDate, setEditingSalaryDate] = useState(false);
  const [salaryDateInput, setSalaryDateInput] = useState("");

  // Snapshot actions
  const [syncingSnapshot, setSyncingSnapshot] = useState(false);
  const [lockingSnapshot, setLockingSnapshot] = useState(false);
  const [showLockConfirm, setShowLockConfirm] = useState(false);
  const [lockWarning, setLockWarning] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    setLoading(true);

    // Get or create snapshot first
    const snap = await getOrCreateSnapshot(period.year, period.month);
    setSnapshot(snap);

    const [{ data: settingsData }, { data: expensesData }, { data: catData }] = await Promise.all([
      supabase.from("personal_settings").select("*").limit(1).single(),
      supabase.from("personal_expenses").select("*")
        .gte("expense_date", snap.start_date).lte("expense_date", snap.end_date)
        .order("expense_date", { ascending: false }),
      supabase.from("personal_categories").select("*")
        .eq("is_active", true).order("sort_order"),
    ]);

    // Load warikan receipts using snapshot dates
    const { data: receipts } = await supabase.from("receipts").select("*")
      .gte("date", snap.start_date).lte("date", snap.end_date);

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

    setSettings(settingsData as PersonalSettings | null);
    setExpenses(expensesData || []);
    setWarikanExpenses(wExpenses);
    setCategories(catData || []);
    setLoading(false);
  }, [period]);

  useEffect(() => { loadData(); }, [loadData]);

  const navigate = (dir: -1 | 1) => setPeriod(getAdjacentPeriod(period.year, period.month, dir));

  const startEditIncome = () => {
    setIncomeInput(String(settings?.monthly_income || ""));
    setEditingIncome(true);
    setTimeout(() => incomeRef.current?.focus(), 50);
  };

  const saveIncome = async () => {
    const val = parseInt(incomeInput) || 0;
    if (settings) {
      await supabase.from("personal_settings").update({ monthly_income: val, updated_at: new Date().toISOString() }).eq("id", settings.id);
      setSettings({ ...settings, monthly_income: val });
    }
    setEditingIncome(false);
    // Resync snapshot if open
    if (snapshot && snapshot.status === "open") {
      const updated = await resyncSnapshot(snapshot.id);
      setSnapshot(updated);
    } else if (snapshot && snapshot.status === "locked") {
      setLockWarning("確定済みのため、スナップショットには反映されません");
      setTimeout(() => setLockWarning(null), 3000);
    }
  };

  const handleResync = async () => {
    if (!snapshot || snapshot.status === "locked") return;
    setSyncingSnapshot(true);
    try {
      const updated = await resyncSnapshot(snapshot.id);
      setSnapshot(updated);
      await loadData();
    } finally {
      setSyncingSnapshot(false);
    }
  };

  const handleLock = async () => {
    if (!snapshot) return;
    setLockingSnapshot(true);
    try {
      const updated = await lockSnapshot(snapshot.id);
      setSnapshot(updated);
    } finally {
      setLockingSnapshot(false);
      setShowLockConfirm(false);
    }
  };

  const handleUnlock = async () => {
    if (!snapshot) return;
    const updated = await unlockSnapshot(snapshot.id);
    setSnapshot(updated);
  };

  const startEditSalaryDate = () => {
    if (!snapshot || snapshot.status === "locked") return;
    setSalaryDateInput(snapshot.salary_pay_date);
    setEditingSalaryDate(true);
  };

  const saveSalaryDate = async () => {
    if (!snapshot || !salaryDateInput) return;
    const result = await updateSalaryPayDate(snapshot.id, salaryDateInput);
    setSnapshot(result.snapshot);
    setEditingSalaryDate(false);
    if (result.prevLockedWarning) {
      setLockWarning("前月が確定済みのため、前月の終了日は変更されませんでした");
      setTimeout(() => setLockWarning(null), 4000);
    }
    await loadData();
  };

  // Derive values from snapshot
  const income = snapshot?.monthly_income || 0;
  const savingsAmount = snapshot?.savings_amount || 0;
  const sharedFixedMyShare = snapshot?.shared_fixed_my_share || 0;
  const personalFixedTotal = snapshot?.personal_fixed_total || 0;
  const utilityMyShare = snapshot?.utility_my_share || 0;
  const available = snapshot?.available_amount || 0;

  const manualSpent = expenses.reduce((sum, e) => sum + e.amount, 0);
  const warikanSpent = warikanExpenses.reduce((sum, e) => sum + e.amount, 0);
  const totalSpent = manualSpent + warikanSpent;

  const remaining = available - totalSpent;
  const endDate = snapshot?.end_date || period.end;
  const remainingDays = getRemainingDays(endDate);
  const dailyBudget = remainingDays > 0 ? Math.floor(remaining / remainingDays) : 0;
  const usagePercent = available > 0 ? Math.round((totalSpent / available) * 100) : 0;

  // Period label from snapshot dates
  const periodLabel = snapshot
    ? (() => {
        const s = new Date(snapshot.start_date + "T00:00:00");
        const e = new Date(snapshot.end_date + "T00:00:00");
        return `${period.month}月度（${s.getMonth() + 1}/${s.getDate()}〜${e.getMonth() + 1}/${e.getDate()}）`;
      })()
    : period.label;

  // Utility period from snapshot
  const utilityPeriodLabel = snapshot?.utility_period
    ? parseInt(snapshot.utility_period.split("-")[1]) + "月度分"
    : "";

  // All expenses merged for display
  const allExpenses: AnyExpense[] = [
    ...expenses.map((e) => ({ ...e, source: undefined as "warikan" | undefined })),
    ...warikanExpenses,
  ].sort((a, b) => b.expense_date.localeCompare(a.expense_date));

  // Category spending (includes warikan)
  const categorySpending = categories.map((cat) => {
    const manual = expenses.filter((e) => e.category === cat.name).reduce((s, e) => s + e.amount, 0);
    const warikan = warikanExpenses.filter((e) => e.category === cat.name).reduce((s, e) => s + e.amount, 0);
    return { ...cat, spent: manual + warikan };
  }).filter((c) => c.spent > 0).sort((a, b) => b.spent - a.spent);

  const maxSpent = categorySpending.length > 0 ? categorySpending[0].spent : 1;

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
        <h1 className="text-sm font-medium tracking-wide" style={{ color: "var(--ink)" }}>{periodLabel}</h1>
        <button onClick={() => navigate(1)} className="text-xl px-3 py-1" style={{ color: "var(--warm-gray-400)" }}>›</button>
      </div>

      {/* Salary Pay Date & Snapshot Status */}
      {snapshot && (
        <div className="card p-4 space-y-3">
          {/* Salary pay date */}
          <div className="flex items-center justify-between">
            <span className="text-xs font-light" style={{ color: "var(--warm-gray-500)" }}>給料日</span>
            {editingSalaryDate ? (
              <div className="flex items-center gap-2">
                <input type="date" value={salaryDateInput} onChange={(e) => setSalaryDateInput(e.target.value)}
                  className="text-xs rounded px-2 py-1 outline-none"
                  style={{ fontSize: "14px", border: "1px solid var(--border)", color: "var(--ink)" }} />
                <button onClick={saveSalaryDate} className="text-xs px-2 py-1 rounded"
                  style={{ backgroundColor: "var(--accent)", color: "#FFFFFF" }}>保存</button>
                <button onClick={() => setEditingSalaryDate(false)} className="text-xs px-2 py-1"
                  style={{ color: "var(--warm-gray-400)" }}>取消</button>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <span className="text-xs font-amount" style={{ color: "var(--ink)" }}>{snapshot.salary_pay_date}</span>
                {snapshot.is_salary_pay_date_manual && (
                  <span className="text-[9px] px-1 rounded" style={{ backgroundColor: "var(--accent-light)", color: "var(--accent-dark)" }}>手動</span>
                )}
                {snapshot.status === "open" && (
                  <button onClick={startEditSalaryDate} className="text-[10px]" style={{ color: "var(--accent)" }}>変更</button>
                )}
              </div>
            )}
          </div>

          <div style={{ borderTop: "1px dashed var(--border)", margin: "4px 0" }} />

          {/* Snapshot status */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-xs font-light" style={{ color: "var(--warm-gray-500)" }}>ステータス</span>
              <span className="text-[10px] px-1.5 py-0.5 rounded-full font-medium"
                style={{
                  backgroundColor: snapshot.status === "locked" ? "var(--warm-gray-100)" : "var(--accent-light)",
                  color: snapshot.status === "locked" ? "var(--warm-gray-600)" : "var(--accent-dark)",
                }}>
                {snapshot.status === "locked" ? "確定済み" : "未確定"}
              </span>
            </div>
            {snapshot.status === "open" ? (
              <div className="flex items-center gap-2">
                <button onClick={handleResync} disabled={syncingSnapshot}
                  className="text-[10px] px-2 py-1 rounded transition-colors disabled:opacity-50"
                  style={{ backgroundColor: "var(--warm-gray-50)", color: "var(--accent)", border: "1px solid var(--border)" }}>
                  {syncingSnapshot ? "同期中..." : "再同期"}
                </button>
                <button onClick={() => setShowLockConfirm(true)}
                  className="text-[10px] px-2 py-1 rounded transition-colors"
                  style={{ backgroundColor: "var(--accent)", color: "#FFFFFF" }}>
                  確定する
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <span className="text-[10px]" style={{ color: "var(--warm-gray-400)" }}>確定済みのため再同期不可</span>
                <button onClick={handleUnlock}
                  className="text-[10px] px-2 py-1 rounded transition-colors"
                  style={{ backgroundColor: "var(--warm-gray-50)", color: "var(--warm-gray-600)", border: "1px solid var(--border)" }}>
                  ロック解除
                </button>
              </div>
            )}
          </div>

          {/* Sync/lock timestamps */}
          <div className="text-[9px] text-right" style={{ color: "var(--warm-gray-300)" }}>
            {snapshot.synced_at && <>同期: {new Date(snapshot.synced_at).toLocaleString("ja-JP")}</>}
            {snapshot.locked_at && <> / 確定: {new Date(snapshot.locked_at).toLocaleString("ja-JP")}</>}
          </div>
        </div>
      )}

      {/* Lock warning toast */}
      {lockWarning && (
        <div className="text-xs text-center py-2 px-3 rounded" style={{ backgroundColor: "var(--warning-light, var(--error-light))", color: "var(--warning, var(--error))" }}>
          {lockWarning}
        </div>
      )}

      {/* Money Flow Card */}
      <div className="card p-6 space-y-3">
        <h2 className="text-xs font-light tracking-widest uppercase mb-4" style={{ color: "var(--warm-gray-400)" }}>今月のお金の流れ</h2>

        <div className="flex justify-between items-center">
          <span className="text-sm font-light" style={{ color: "var(--warm-gray-500)" }}>手取り収入</span>
          {editingIncome ? (
            <div className="flex items-center gap-1">
              <span className="font-amount text-sm" style={{ color: "var(--warm-gray-400)" }}>¥</span>
              <input ref={incomeRef} type="number" inputMode="numeric" value={incomeInput}
                onChange={(e) => setIncomeInput(e.target.value)} onBlur={saveIncome}
                onKeyDown={(e) => e.key === "Enter" && saveIncome()}
                className="w-28 text-right font-amount font-semibold outline-none bg-transparent"
                style={{ fontSize: "16px", borderBottom: "2px solid var(--accent)", color: "var(--ink)" }} />
            </div>
          ) : (
            <button onClick={startEditIncome} className="font-amount font-semibold flex items-center gap-1.5" style={{ color: "var(--ink)" }}>
              ¥{income.toLocaleString()} <span className="text-[10px]" style={{ color: "var(--warm-gray-400)" }}>✎</span>
            </button>
          )}
        </div>

        <div style={{ borderTop: "1px dashed var(--border)", margin: "8px 0" }} />

        <div className="flex justify-between items-center">
          <span className="text-sm font-light" style={{ color: "var(--warm-gray-500)" }}>- 先取り貯蓄</span>
          <span className="font-amount text-sm" style={{ color: "var(--warm-gray-500)" }}>-¥{savingsAmount.toLocaleString()}</span>
        </div>
        {snapshot?.savings_source === "kakeibo" && (
          <p className="text-[10px] text-right" style={{ color: "var(--accent)" }}>家計簿から取得</p>
        )}

        <div className="flex justify-between items-center">
          <span className="text-sm font-light" style={{ color: "var(--warm-gray-500)" }}>- 共通固定費（俊樹負担）</span>
          <span className="font-amount text-sm" style={{ color: "var(--warm-gray-500)" }}>-¥{sharedFixedMyShare.toLocaleString()}</span>
        </div>
        <p className="text-[10px] text-right" style={{ color: "var(--accent)" }}>ワリカンから取得</p>

        <div className="flex justify-between items-center">
          <span className="text-sm font-light" style={{ color: "var(--warm-gray-500)" }}>- 個人固定費</span>
          <span className="font-amount text-sm" style={{ color: "var(--warm-gray-500)" }}>-¥{personalFixedTotal.toLocaleString()}</span>
        </div>

        <div className="flex justify-between items-center">
          <span className="text-sm font-light" style={{ color: "var(--warm-gray-500)" }}>- 光熱費（俊樹負担）</span>
          <span className="font-amount text-sm" style={{ color: "var(--warm-gray-500)" }}>-¥{utilityMyShare.toLocaleString()}</span>
        </div>
        <p className="text-[10px] text-right" style={{ color: "var(--accent)" }}>ワリカンから取得（{utilityPeriodLabel}）</p>

        <div style={{ borderTop: "1.5px solid var(--accent-muted)", margin: "10px 0" }} />
        <div className="flex justify-between items-baseline">
          <span className="text-sm font-medium" style={{ color: "var(--accent)" }}>= 今月使える額</span>
          <span className="font-amount font-bold text-lg" style={{ color: "var(--accent)" }}>¥{available.toLocaleString()}</span>
        </div>

        <div style={{ borderTop: "1px dashed var(--border)", margin: "8px 0" }} />
        <div className="flex justify-between items-center">
          <span className="text-sm font-light" style={{ color: "var(--warm-gray-500)" }}>- 消費合計</span>
          <span className="font-amount text-sm font-semibold" style={{ color: "var(--error)" }}>-¥{totalSpent.toLocaleString()}</span>
        </div>

        <div style={{ borderTop: "2px solid var(--border-strong)", margin: "10px 0" }} />
        <div className="flex justify-between items-baseline">
          <span className="text-sm font-bold" style={{ color: "var(--ink)" }}>= 残額</span>
          <span className="font-amount font-extrabold text-3xl" style={{ color: remaining >= 0 ? "var(--ink)" : "var(--error)" }}>
            ¥{remaining.toLocaleString()}
          </span>
        </div>
      </div>

      {/* Remaining Balance Card */}
      <div className="card p-5" style={{ backgroundColor: remaining >= 0 ? "var(--accent-light)" : "var(--error-light)" }}>
        <div className="flex justify-between items-end mb-4">
          <div>
            <p className="text-xs font-light" style={{ color: "var(--warm-gray-500)" }}>残り{remainingDays}日</p>
            <p className="text-sm mt-0.5" style={{ color: "var(--warm-gray-600)" }}>
              1日あたり: <span className="font-amount font-bold" style={{ color: dailyBudget >= 0 ? "var(--accent-dark)" : "var(--error)" }}>¥{dailyBudget.toLocaleString()}</span>
            </p>
          </div>
          <p className="font-amount text-xs" style={{ color: "var(--warm-gray-400)" }}>{usagePercent}%</p>
        </div>
        <div className="w-full rounded-full h-1.5" style={{ backgroundColor: "var(--warm-gray-200)" }}>
          <div
            className="h-1.5 rounded-full transition-all"
            style={{
              width: `${Math.min(usagePercent, 100)}%`,
              backgroundColor: usagePercent <= 70 ? "var(--accent)" : usagePercent <= 90 ? "var(--warning)" : "var(--error)",
            }}
          />
        </div>
      </div>

      {/* Category Spending */}
      {categorySpending.length > 0 && (
        <div className="card p-5">
          <h2 className="text-xs font-light tracking-widest mb-4" style={{ color: "var(--warm-gray-400)" }}>カテゴリ別消費</h2>
          <div className="space-y-3">
            {categorySpending.map((cat) => (
              <div key={cat.id}>
                <div className="flex justify-between items-baseline text-sm mb-1">
                  <span style={{ color: "var(--warm-gray-600)" }}>{cat.icon} {cat.name}</span>
                  <span className="font-amount font-semibold" style={{ color: "var(--ink)" }}>¥{cat.spent.toLocaleString()}</span>
                </div>
                <div className="w-full rounded-full h-1" style={{ backgroundColor: "var(--warm-gray-100)" }}>
                  <div className="h-1 rounded-full" style={{ width: `${(cat.spent / maxSpent) * 100}%`, backgroundColor: "var(--accent)" }} />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Recent Expenses */}
      <div className="card p-5">
        <h2 className="text-xs font-light tracking-widest mb-4" style={{ color: "var(--warm-gray-400)" }}>最近の支出</h2>
        {allExpenses.length === 0 ? (
          <p className="text-sm text-center py-6" style={{ color: "var(--warm-gray-300)" }}>まだ記録がありません</p>
        ) : (
          <div className="space-y-1">
            {allExpenses.slice(0, 8).map((exp) => {
              const cat = categories.find((c) => c.name === exp.category);
              const isWarikan = exp.source === "warikan";
              const inner = (
                <div className="flex items-center justify-between py-2.5">
                  <div className="flex items-center gap-3">
                    <span className="text-lg">{cat?.icon || SYNC_ICON_MAP[exp.category] || "📦"}</span>
                    <div>
                      <p className="text-sm" style={{ color: "var(--ink-light)" }}>{exp.memo || exp.category}</p>
                      <p className="text-xs" style={{ color: "var(--warm-gray-400)" }}>
                        {exp.expense_date}
                        {isWarikan && <span className="ml-1" style={{ color: "var(--accent)" }}>ワリカンから同期</span>}
                      </p>
                    </div>
                  </div>
                  <span className="font-amount text-sm font-semibold" style={{ color: "var(--ink)" }}>-¥{exp.amount.toLocaleString()}</span>
                </div>
              );
              return isWarikan ? (
                <div key={exp.id}>{inner}</div>
              ) : (
                <Link key={exp.id} href={`/record/${exp.id}`}>{inner}</Link>
              );
            })}
          </div>
        )}
      </div>

      {/* Lock Confirmation Modal */}
      {showLockConfirm && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50" onClick={() => setShowLockConfirm(false)}>
          <div className="bg-white rounded-lg w-80 p-6 space-y-4" style={{ border: "1px solid var(--border)" }} onClick={(e) => e.stopPropagation()}>
            <h3 className="text-sm font-medium text-center" style={{ color: "var(--ink)" }}>この月を確定しますか？</h3>
            <p className="text-xs text-center" style={{ color: "var(--warm-gray-500)" }}>確定後は再同期できなくなります。ロック解除で元に戻せます。</p>
            <div className="flex gap-3">
              <button onClick={() => setShowLockConfirm(false)}
                className="flex-1 py-2.5 rounded text-sm font-medium"
                style={{ backgroundColor: "var(--warm-gray-100)", color: "var(--ink-light)" }}>
                キャンセル
              </button>
              <button onClick={handleLock} disabled={lockingSnapshot}
                className="flex-1 py-2.5 rounded text-sm font-medium disabled:opacity-50"
                style={{ backgroundColor: "var(--accent)", color: "#FFFFFF" }}>
                {lockingSnapshot ? "処理中..." : "確定する"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
