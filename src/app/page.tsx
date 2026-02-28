"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { supabase } from "@/lib/supabase";
import type { PersonalExpense, PersonalSettings, PersonalCategory } from "@/lib/supabase";
import { getCurrentPeriod, getAdjacentPeriod, getRemainingDays, getPreviousPeriodMonth } from "@/lib/salary-cycle";
import Link from "next/link";

export default function HomePage() {
  const [period, setPeriod] = useState(getCurrentPeriod());
  const [settings, setSettings] = useState<PersonalSettings | null>(null);
  const [expenses, setExpenses] = useState<PersonalExpense[]>([]);
  const [categories, setCategories] = useState<PersonalCategory[]>([]);
  const [fixedTotal, setFixedTotal] = useState(0);
  const [utilityTotal, setUtilityTotal] = useState(0);
  const [savingsAmount, setSavingsAmount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [editingIncome, setEditingIncome] = useState(false);
  const [incomeInput, setIncomeInput] = useState("");
  const incomeRef = useRef<HTMLInputElement>(null);

  const loadData = useCallback(async () => {
    setLoading(true);

    // Load settings
    const { data: settingsData } = await supabase
      .from("personal_settings")
      .select("*")
      .limit(1)
      .single();

    // Load expenses for current period
    const { data: expensesData } = await supabase
      .from("personal_expenses")
      .select("*")
      .gte("expense_date", period.start)
      .lte("expense_date", period.end)
      .order("expense_date", { ascending: false });

    // Load categories
    const { data: catData } = await supabase
      .from("personal_categories")
      .select("*")
      .eq("is_active", true)
      .order("sort_order");

    // Load fixed costs from warikan (active only, split by 2)
    const { data: fixedData } = await supabase
      .from("fixed_costs")
      .select("amount")
      .eq("is_active", true);

    // Load utility bills (previous month period)
    const prev = getPreviousPeriodMonth();
    const prevPeriodStr = `${prev.year}-${String(prev.month).padStart(2, "0")}`;
    const { data: utilityData } = await supabase
      .from("utility_bills")
      .select("amount")
      .eq("period", prevPeriodStr);

    // Load savings from kakeibo (monthly_savings)
    const s = settingsData as PersonalSettings | null;
    let savings = 0;
    if (s?.savings_source === "kakeibo") {
      const { data: savingsData } = await supabase
        .from("monthly_savings")
        .select("amount")
        .eq("year", period.year)
        .eq("month", period.month)
        .eq("person", "俊樹")
        .single();
      savings = savingsData?.amount || 0;
    } else if (s) {
      if (s.savings_percent) {
        savings = Math.floor(s.monthly_income * s.savings_percent / 100);
      } else {
        savings = s.savings_amount || 0;
      }
    }

    setSettings(s);
    setExpenses(expensesData || []);
    setCategories(catData || []);
    setFixedTotal(fixedData ? fixedData.reduce((sum, c) => sum + c.amount, 0) : 0);
    setUtilityTotal(utilityData ? utilityData.reduce((sum, u) => sum + u.amount, 0) : 0);
    setSavingsAmount(savings);
    setLoading(false);
  }, [period]);

  useEffect(() => { loadData(); }, [loadData]);

  const navigate = (dir: -1 | 1) => {
    const next = getAdjacentPeriod(period.year, period.month, dir);
    setPeriod(next);
  };

  const startEditIncome = () => {
    setIncomeInput(String(settings?.monthly_income || ""));
    setEditingIncome(true);
    setTimeout(() => incomeRef.current?.focus(), 50);
  };

  const saveIncome = async () => {
    const val = parseInt(incomeInput) || 0;
    if (settings) {
      await supabase.from("personal_settings").update({
        monthly_income: val,
        updated_at: new Date().toISOString(),
      }).eq("id", settings.id);
      setSettings({ ...settings, monthly_income: val });
    }
    setEditingIncome(false);
  };

  const income = settings?.monthly_income || 0;
  const fixedMyShare = Math.floor(fixedTotal / 2);
  const utilityMyShare = Math.floor(utilityTotal / 2);
  const available = income - savingsAmount - fixedMyShare - utilityMyShare;
  const totalSpent = expenses.reduce((sum, e) => sum + e.amount, 0);
  const remaining = available - totalSpent;
  const remainingDays = getRemainingDays(period.end);
  const dailyBudget = remainingDays > 0 ? Math.floor(remaining / remainingDays) : 0;
  const usagePercent = available > 0 ? Math.round((totalSpent / available) * 100) : 0;

  const prevMonth = getPreviousPeriodMonth();

  // Category spending
  const categorySpending = categories.map((cat) => {
    const spent = expenses
      .filter((e) => e.category === cat.name)
      .reduce((sum, e) => sum + e.amount, 0);
    return { ...cat, spent };
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
              <input
                ref={incomeRef}
                type="number"
                inputMode="numeric"
                value={incomeInput}
                onChange={(e) => setIncomeInput(e.target.value)}
                onBlur={saveIncome}
                onKeyDown={(e) => e.key === "Enter" && saveIncome()}
                className="w-28 text-right font-bold border-b-2 border-emerald-500 outline-none bg-transparent"
                style={{ fontSize: "16px" }}
              />
            </div>
          ) : (
            <button onClick={startEditIncome} className="font-bold text-gray-800 flex items-center gap-1">
              ¥{income.toLocaleString()}
              <span className="text-[10px] text-gray-400">✎</span>
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
          <span className="text-gray-600">- 固定費（俊樹負担）</span>
          <span className="text-gray-500">-¥{fixedMyShare.toLocaleString()}</span>
        </div>
        <p className="text-[10px] text-emerald-500 text-right">ワリカンから取得</p>

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
            className={`h-3 rounded-full transition-all ${
              usagePercent <= 70 ? "bg-emerald-500" : usagePercent <= 90 ? "bg-yellow-500" : "bg-red-500"
            }`}
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
                  <div
                    className="h-2 rounded-full bg-emerald-400"
                    style={{ width: `${(cat.spent / maxSpent) * 100}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Recent Expenses */}
      <div className="bg-white rounded-2xl p-4 shadow-sm">
        <h2 className="text-xs font-bold text-gray-500 mb-3">最近の支出</h2>
        {expenses.length === 0 ? (
          <p className="text-sm text-gray-400 text-center py-4">まだ記録がありません</p>
        ) : (
          <div className="space-y-2">
            {expenses.slice(0, 5).map((exp) => {
              const cat = categories.find((c) => c.name === exp.category);
              return (
                <Link
                  key={exp.id}
                  href={`/record/${exp.id}`}
                  className="flex items-center justify-between py-1.5 border-b border-gray-50 last:border-0"
                >
                  <div className="flex items-center gap-2">
                    <span className="text-lg">{cat?.icon || "📦"}</span>
                    <div>
                      <p className="text-sm text-gray-700">{exp.memo || exp.category}</p>
                      <p className="text-xs text-gray-400">{exp.expense_date}</p>
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
