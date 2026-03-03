"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { supabase } from "@/lib/supabase";
import type { PersonalExpense, PersonalSettings, PersonalCategory, WarikanExpense } from "@/lib/supabase";
import { getCurrentPeriod, getAdjacentPeriod, getRemainingDays, getPreviousPeriodMonth } from "@/lib/salary-cycle";
import Link from "next/link";

type AnyExpense = (PersonalExpense | WarikanExpense) & { source?: "warikan" };

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

      {/* Money Flow Card */}
      <div className="bg-white rounded-2xl p-4 shadow-sm space-y-2">
        <h2 className="text-xs font-bold text-gray-500 mb-2">今月のお金の流れ</h2>

        <div className="flex justify-between items-center text-sm">
          <span className="text-gray-600">手取り収入</span>
          {editingIncome ? (
            <div className="flex items-center gap-1">
              <span className="text-gray-400">¥</span>
              <input ref={incomeRef} type="number" inputMode="numeric" value={incomeInput}
                onChange={(e) => setIncomeInput(e.target.value)} onBlur={saveIncome}
                onKeyDown={(e) => e.key === "Enter" && saveIncome()}
                className="w-28 text-right font-bold border-b-2 border-emerald-500 outline-none bg-transparent"
                style={{ fontSize: "16px" }} />
            </div>
          ) : (
            <button onClick={startEditIncome} className="font-bold text-gray-800 flex items-center gap-1">
              ¥{income.toLocaleString()} <span className="text-[10px] text-gray-400">✎</span>
            </button>
          )}
        </div>
        <div className="border-t border-dashed border-gray-200 my-1" />

        <div className="flex justify-between text-sm">
          <span className="text-gray-600">- 先取り貯蓄</span>
          <span className="text-gray-500">-¥{savingsAmount.toLocaleString()}</span>
        </div>
        {settings?.savings_source === "kakeibo" && (
          <p className="text-[10px] text-emerald-500 text-right">家計簿から取得</p>
        )}

        <div className="flex justify-between text-sm">
          <span className="text-gray-600">- 共通固定費（俊樹負担）</span>
          <span className="text-gray-500">-¥{fixedMyShare.toLocaleString()}</span>
        </div>
        <p className="text-[10px] text-emerald-500 text-right">ワリカンから取得</p>

        <div className="flex justify-between text-sm">
          <span className="text-gray-600">- 個人固定費</span>
          <span className="text-gray-500">-¥{personalFixedTotal.toLocaleString()}</span>
        </div>

        <div className="flex justify-between text-sm">
          <span className="text-gray-600">- 光熱費（俊樹負担）</span>
          <span className="text-gray-500">-¥{utilityMyShare.toLocaleString()}</span>
        </div>
        <p className="text-[10px] text-emerald-500 text-right">ワリカンから取得（{prevMonth.month}月度分）</p>

        <div className="border-t-2 border-emerald-200 my-1" />
        <div className="flex justify-between text-sm">
          <span className="font-bold text-emerald-700">= 今月使える額</span>
          <span className="font-bold text-emerald-700 text-lg">¥{available.toLocaleString()}</span>
        </div>

        <div className="border-t border-dashed border-gray-200 my-1" />
        <div className="flex justify-between text-sm">
          <span className="text-gray-600">- 消費合計</span>
          <span className="text-red-500 font-semibold">-¥{totalSpent.toLocaleString()}</span>
        </div>

        <div className="border-t-2 border-gray-300 my-1" />
        <div className="flex justify-between">
          <span className="font-bold text-gray-800">= 残額</span>
          <span className={`font-black text-2xl ${remaining >= 0 ? "text-emerald-600" : "text-red-600"}`}>
            ¥{remaining.toLocaleString()}
          </span>
        </div>
      </div>

      {/* Remaining Balance Card */}
      <div className={`rounded-2xl p-4 shadow-sm ${remaining >= 0 ? "bg-emerald-50" : "bg-red-50"}`}>
        <div className="flex justify-between items-end mb-3">
          <div>
            <p className="text-xs text-gray-500">残り{remainingDays}日</p>
            <p className="text-sm text-gray-600">
              1日あたり: <span className={`font-bold ${dailyBudget >= 0 ? "text-emerald-700" : "text-red-600"}`}>¥{dailyBudget.toLocaleString()}</span>
            </p>
          </div>
          <p className="text-xs text-gray-500">{usagePercent}% 使用</p>
        </div>
        <div className="w-full bg-gray-200 rounded-full h-3">
          <div
            className={`h-3 rounded-full transition-all ${usagePercent <= 70 ? "bg-emerald-500" : usagePercent <= 90 ? "bg-yellow-500" : "bg-red-500"}`}
            style={{ width: `${Math.min(usagePercent, 100)}%` }}
          />
        </div>
      </div>

      {/* Category Spending */}
      {categorySpending.length > 0 && (
        <div className="bg-white rounded-2xl p-4 shadow-sm">
          <h2 className="text-xs font-bold text-gray-500 mb-3">カテゴリ別消費</h2>
          <div className="space-y-2">
            {categorySpending.map((cat) => (
              <div key={cat.id}>
                <div className="flex justify-between text-sm mb-0.5">
                  <span>{cat.icon} {cat.name}</span>
                  <span className="font-semibold">¥{cat.spent.toLocaleString()}</span>
                </div>
                <div className="w-full bg-gray-100 rounded-full h-2">
                  <div className="h-2 rounded-full bg-emerald-400" style={{ width: `${(cat.spent / maxSpent) * 100}%` }} />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Recent Expenses */}
      <div className="bg-white rounded-2xl p-4 shadow-sm">
        <h2 className="text-xs font-bold text-gray-500 mb-3">最近の支出</h2>
        {allExpenses.length === 0 ? (
          <p className="text-sm text-gray-400 text-center py-4">まだ記録がありません</p>
        ) : (
          <div className="space-y-2">
            {allExpenses.slice(0, 8).map((exp) => {
              const cat = categories.find((c) => c.name === exp.category);
              const isWarikan = exp.source === "warikan";
              const inner = (
                <div className="flex items-center justify-between py-1.5 border-b border-gray-50 last:border-0">
                  <div className="flex items-center gap-2">
                    <span className="text-lg">{cat?.icon || "📦"}</span>
                    <div>
                      <p className="text-sm text-gray-700">{exp.memo || exp.category}</p>
                      <p className="text-xs text-gray-400">
                        {exp.expense_date}
                        {isWarikan && <span className="ml-1 text-emerald-500">ワリカンから同期</span>}
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
        )}
      </div>
    </div>
  );
}
