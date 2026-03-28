"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { supabase } from "@/lib/supabase";
import type { PersonalExpense, PersonalSettings, PersonalCategory, WarikanExpense } from "@/lib/supabase";
import { getCurrentPeriod, getAdjacentPeriod, getRemainingDays, getPreviousPeriodMonth } from "@/lib/salary-cycle";
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
  const [fixedTotal, setFixedTotal] = useState(0);
  const [personalFixedTotal, setPersonalFixedTotal] = useState(0);
  const [utilityTotal, setUtilityTotal] = useState(0);
  const [savingsAmount, setSavingsAmount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [editingIncome, setEditingIncome] = useState(false);
  const [incomeInput, setIncomeInput] = useState("");
  const incomeRef = useRef<HTMLInputElement>(null);

  const loadData = useCallback(async () => {
    setLoading(true);

    const { data: settingsData } = await supabase.from("personal_settings").select("*").limit(1).single();
    const { data: expensesData } = await supabase.from("personal_expenses").select("*")
      .gte("expense_date", period.start).lte("expense_date", period.end)
      .order("expense_date", { ascending: false });
    const { data: catData } = await supabase.from("personal_categories").select("*")
      .eq("is_active", true).order("sort_order");
    const { data: fixedData } = await supabase.from("fixed_costs").select("amount").eq("is_active", true);
    const { data: personalFixedData } = await supabase.from("personal_fixed_costs").select("amount").eq("is_active", true);

    const prev = getPreviousPeriodMonth();
    const prevPeriodStr = `${prev.year}-${String(prev.month).padStart(2, "0")}`;
    const { data: utilityData } = await supabase.from("utility_bills").select("amount").eq("period", prevPeriodStr);

    // Load savings
    const s = settingsData as PersonalSettings | null;
    let savings = 0;
    if (s?.savings_source === "kakeibo") {
      const { data: savingsData } = await supabase.from("monthly_savings").select("amount")
        .eq("year", period.year).eq("month", period.month).eq("person", "俊樹").single();
      savings = savingsData?.amount || 0;
    } else if (s) {
      savings = s.savings_percent ? Math.floor(s.monthly_income * s.savings_percent / 100) : (s.savings_amount || 0);
    }

    // Load warikan receipts for this period
    const { data: receipts } = await supabase.from("receipts").select("*")
      .gte("date", period.start).lte("date", period.end);

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

    setSettings(s);
    setExpenses(expensesData || []);
    setWarikanExpenses(wExpenses);
    setCategories(catData || []);
    setFixedTotal(fixedData ? fixedData.reduce((sum, c) => sum + c.amount, 0) : 0);
    setPersonalFixedTotal(personalFixedData ? personalFixedData.reduce((sum, c) => sum + c.amount, 0) : 0);
    setUtilityTotal(utilityData ? utilityData.reduce((sum, u) => sum + u.amount, 0) : 0);
    setSavingsAmount(savings);
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
  };

  const income = settings?.monthly_income || 0;
  const fixedMyShare = Math.floor(fixedTotal / 2);
  const utilityMyShare = Math.floor(utilityTotal / 2);
  const available = income - savingsAmount - fixedMyShare - personalFixedTotal - utilityMyShare;

  const manualSpent = expenses.reduce((sum, e) => sum + e.amount, 0);
  const warikanSpent = warikanExpenses.reduce((sum, e) => sum + e.amount, 0);
  const totalSpent = manualSpent + warikanSpent;

  const remaining = available - totalSpent;
  const remainingDays = getRemainingDays(period.end);
  const dailyBudget = remainingDays > 0 ? Math.floor(remaining / remainingDays) : 0;
  const usagePercent = available > 0 ? Math.round((totalSpent / available) * 100) : 0;

  const prevMonth = getPreviousPeriodMonth();

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
        <h1 className="text-sm font-medium tracking-wide" style={{ color: "var(--ink)" }}>{period.label}</h1>
        <button onClick={() => navigate(1)} className="text-xl px-3 py-1" style={{ color: "var(--warm-gray-400)" }}>›</button>
      </div>

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
        {settings?.savings_source === "kakeibo" && (
          <p className="text-[10px] text-right" style={{ color: "var(--accent)" }}>家計簿から取得</p>
        )}

        <div className="flex justify-between items-center">
          <span className="text-sm font-light" style={{ color: "var(--warm-gray-500)" }}>- 共通固定費（俊樹負担）</span>
          <span className="font-amount text-sm" style={{ color: "var(--warm-gray-500)" }}>-¥{fixedMyShare.toLocaleString()}</span>
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
        <p className="text-[10px] text-right" style={{ color: "var(--accent)" }}>ワリカンから取得（{prevMonth.month}月度分）</p>

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
    </div>
  );
}
