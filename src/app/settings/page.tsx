"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import type { PersonalSettings, PersonalCategory, FixedCost } from "@/lib/supabase";
import { getCurrentPeriod, getPreviousPeriodMonth } from "@/lib/salary-cycle";

export default function SettingsPage() {
  const [settings, setSettings] = useState<PersonalSettings | null>(null);
  const [categories, setCategories] = useState<PersonalCategory[]>([]);
  const [fixedCosts, setFixedCosts] = useState<FixedCost[]>([]);
  const [utilities, setUtilities] = useState<{ type: string; amount: number }[]>([]);
  const [savingsFromKakeibo, setSavingsFromKakeibo] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [newCatName, setNewCatName] = useState("");
  const [newCatIcon, setNewCatIcon] = useState("📌");
  const [toast, setToast] = useState<string | null>(null);
  const [exportingCsv, setExportingCsv] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState(false);

  useEffect(() => { loadData(); }, []);

  async function loadData() {
    const period = getCurrentPeriod();
    const prev = getPreviousPeriodMonth();
    const prevPeriodStr = `${prev.year}-${String(prev.month).padStart(2, "0")}`;

    const [
      { data: s },
      { data: cats },
      { data: fixed },
      { data: utils },
      { data: savData },
    ] = await Promise.all([
      supabase.from("personal_settings").select("*").limit(1).single(),
      supabase.from("personal_categories").select("*").order("sort_order"),
      supabase.from("fixed_costs").select("*").eq("is_active", true).order("sort_order"),
      supabase.from("utility_bills").select("type,amount").eq("period", prevPeriodStr),
      supabase.from("monthly_savings").select("amount").eq("year", period.year).eq("month", period.month).eq("person", "俊樹").single(),
    ]);

    setSettings(s as PersonalSettings);
    setCategories(cats || []);
    setFixedCosts(fixed || []);
    setUtilities(utils || []);
    setSavingsFromKakeibo(savData?.amount ?? null);
    setLoading(false);
  }

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 2000);
  };

  const saveSettings = async (updates: Partial<PersonalSettings>) => {
    if (!settings) return;
    setSaving(true);
    await supabase.from("personal_settings").update({
      ...updates,
      updated_at: new Date().toISOString(),
    }).eq("id", settings.id);
    setSettings({ ...settings, ...updates });
    setSaving(false);
    showToast("保存しました");
  };

  const addCategory = async () => {
    if (!newCatName.trim()) return;
    const maxOrder = categories.length > 0 ? Math.max(...categories.map((c) => c.sort_order)) : 0;
    const { data } = await supabase.from("personal_categories")
      .insert({ name: newCatName.trim(), icon: newCatIcon, sort_order: maxOrder + 1, is_default: false, is_active: true })
      .select().single();
    if (data) setCategories([...categories, data as PersonalCategory]);
    setNewCatName("");
    setNewCatIcon("📌");
  };

  const toggleCategory = async (id: string, active: boolean) => {
    await supabase.from("personal_categories").update({ is_active: active }).eq("id", id);
    setCategories(categories.map((c) => c.id === id ? { ...c, is_active: active } : c));
  };

  const updateBudget = async (id: string, amount: number | null) => {
    await supabase.from("personal_categories").update({ budget_amount: amount }).eq("id", id);
    setCategories(categories.map((c) => c.id === id ? { ...c, budget_amount: amount } : c));
  };

  const exportCsv = async () => {
    setExportingCsv(true);
    const period = getCurrentPeriod();
    const { data } = await supabase.from("personal_expenses").select("*")
      .gte("expense_date", period.start).lte("expense_date", period.end)
      .order("expense_date");

    if (data && data.length > 0) {
      const header = "日付,カテゴリ,金額,支払方法,メモ\n";
      const rows = data.map((e) => `${e.expense_date},${e.category},${e.amount},${e.payment_method},${e.memo || ""}`).join("\n");
      const bom = "\uFEFF";
      const blob = new Blob([bom + header + rows], { type: "text/csv;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `消費記録_${period.month}月度.csv`;
      a.click();
      URL.revokeObjectURL(url);
    }
    setExportingCsv(false);
  };

  const deleteAllData = async () => {
    await supabase.from("personal_expenses").delete().neq("id", "00000000-0000-0000-0000-000000000000");
    setDeleteConfirm(false);
    showToast("全データを削除しました");
  };

  const fixedTotal = fixedCosts.reduce((s, c) => s + c.amount, 0);
  const utilityTotal = utilities.reduce((s, u) => s + u.amount, 0);
  const TYPE_LABELS: Record<string, string> = { electric: "電気", gas: "ガス", water: "水道" };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-emerald-600" />
      </div>
    );
  }

  return (
    <div className="space-y-4 pb-8">
      <h1 className="text-lg font-bold text-gray-800">設定</h1>

      {/* Income */}
      <div className="bg-white rounded-2xl p-4 shadow-sm space-y-3">
        <h2 className="text-sm font-bold text-gray-700">収入の設定</h2>
        <div>
          <label className="text-xs text-gray-500">月の手取り収入</label>
          <div className="flex items-center gap-1 mt-1">
            <span className="text-gray-400">¥</span>
            <input
              type="number"
              inputMode="numeric"
              value={settings?.monthly_income || ""}
              onChange={(e) => setSettings(settings ? { ...settings, monthly_income: parseInt(e.target.value) || 0 } : null)}
              onBlur={(e) => saveSettings({ monthly_income: parseInt(e.target.value) || 0 })}
              className="flex-1 text-sm font-bold border-b border-gray-200 py-1.5 outline-none focus:border-emerald-500 bg-transparent"
              style={{ fontSize: "16px" }}
            />
          </div>
        </div>
      </div>

      {/* Savings */}
      <div className="bg-white rounded-2xl p-4 shadow-sm space-y-3">
        <h2 className="text-sm font-bold text-gray-700">先取り貯蓄</h2>

        <div className="flex gap-2">
          {(["kakeibo", "manual"] as const).map((src) => (
            <button
              key={src}
              onClick={() => saveSettings({ savings_source: src })}
              className={`text-xs px-3 py-1.5 rounded-full ${settings?.savings_source === src ? "bg-emerald-600 text-white" : "bg-gray-100 text-gray-600"}`}
            >
              {src === "kakeibo" ? "家計簿から取得" : "手入力"}
            </button>
          ))}
        </div>

        {settings?.savings_source === "kakeibo" ? (
          <div className="bg-emerald-50 rounded-lg p-3">
            <p className="text-xs text-gray-500">家計簿アプリから自動取得</p>
            <p className="text-lg font-bold text-emerald-700">
              ¥{(savingsFromKakeibo ?? 0).toLocaleString()}
            </p>
          </div>
        ) : (
          <div>
            <label className="text-xs text-gray-500">貯蓄額</label>
            <div className="flex items-center gap-1 mt-1">
              <span className="text-gray-400">¥</span>
              <input
                type="number"
                inputMode="numeric"
                value={settings?.savings_amount || ""}
                onChange={(e) => setSettings(settings ? { ...settings, savings_amount: parseInt(e.target.value) || 0 } : null)}
                onBlur={(e) => saveSettings({ savings_amount: parseInt(e.target.value) || 0 })}
                className="flex-1 text-sm font-bold border-b border-gray-200 py-1.5 outline-none focus:border-emerald-500 bg-transparent"
                style={{ fontSize: "16px" }}
              />
            </div>
          </div>
        )}
      </div>

      {/* Fixed Costs (Read-only) */}
      <div className="bg-white rounded-2xl p-4 shadow-sm space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-bold text-gray-700">固定費</h2>
          <span className="text-[10px] text-emerald-500 bg-emerald-50 px-2 py-0.5 rounded-full">ワリカンから自動取得</span>
        </div>
        <div className="space-y-1">
          {fixedCosts.map((c) => (
            <div key={c.id} className="flex justify-between text-sm">
              <span className="text-gray-600">{c.name}</span>
              <span className="text-gray-700">¥{c.amount.toLocaleString()}</span>
            </div>
          ))}
        </div>
        <div className="border-t pt-2 flex justify-between text-sm font-bold">
          <span>合計</span>
          <span>¥{fixedTotal.toLocaleString()}</span>
        </div>
        <div className="flex justify-between text-sm text-emerald-700">
          <span>俊樹負担（÷2）</span>
          <span className="font-bold">¥{Math.floor(fixedTotal / 2).toLocaleString()}</span>
        </div>
        <p className="text-[10px] text-gray-400">変更はワリカンアプリで行ってください</p>
      </div>

      {/* Utility Bills (Read-only) */}
      <div className="bg-white rounded-2xl p-4 shadow-sm space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-bold text-gray-700">光熱費</h2>
          <span className="text-[10px] text-emerald-500 bg-emerald-50 px-2 py-0.5 rounded-full">ワリカンから取得（先月分）</span>
        </div>
        {utilities.length === 0 ? (
          <p className="text-sm text-gray-400">先月分のデータなし</p>
        ) : (
          <>
            <div className="space-y-1">
              {utilities.map((u, i) => (
                <div key={i} className="flex justify-between text-sm">
                  <span className="text-gray-600">{TYPE_LABELS[u.type] || u.type}</span>
                  <span className="text-gray-700">¥{u.amount.toLocaleString()}</span>
                </div>
              ))}
            </div>
            <div className="border-t pt-2 flex justify-between text-sm text-emerald-700">
              <span>俊樹負担（÷2）</span>
              <span className="font-bold">¥{Math.floor(utilityTotal / 2).toLocaleString()}</span>
            </div>
          </>
        )}
      </div>

      {/* Category Management */}
      <div className="bg-white rounded-2xl p-4 shadow-sm space-y-3">
        <h2 className="text-sm font-bold text-gray-700">カテゴリ管理</h2>
        <div className="space-y-2">
          {categories.map((cat) => (
            <div key={cat.id} className={`flex items-center justify-between ${!cat.is_active ? "opacity-40" : ""}`}>
              <span className="text-sm">{cat.icon} {cat.name}</span>
              <div className="flex items-center gap-3">
                <input
                  type="number"
                  inputMode="numeric"
                  placeholder="予算"
                  value={cat.budget_amount || ""}
                  onChange={(e) => {
                    const val = parseInt(e.target.value) || null;
                    setCategories(categories.map((c) => c.id === cat.id ? { ...c, budget_amount: val } : c));
                  }}
                  onBlur={(e) => updateBudget(cat.id, parseInt(e.target.value) || null)}
                  className="w-20 text-xs text-right border-b border-gray-200 py-1 outline-none"
                  style={{ fontSize: "16px" }}
                />
                <button
                  onClick={() => toggleCategory(cat.id, !cat.is_active)}
                  className={`w-9 h-5 rounded-full transition ${cat.is_active ? "bg-emerald-600" : "bg-gray-300"}`}
                >
                  <span className={`block w-3.5 h-3.5 rounded-full bg-white shadow transition-transform ${cat.is_active ? "translate-x-4" : "translate-x-0.5"}`} />
                </button>
              </div>
            </div>
          ))}
        </div>
        <div className="border-t pt-3">
          <label className="text-xs text-gray-500">カテゴリ追加</label>
          <div className="flex gap-2 mt-1">
            <input
              type="text"
              value={newCatIcon}
              onChange={(e) => setNewCatIcon(e.target.value)}
              className="w-12 text-center border border-gray-200 rounded-lg py-2"
              style={{ fontSize: "16px" }}
            />
            <input
              type="text"
              value={newCatName}
              onChange={(e) => setNewCatName(e.target.value)}
              placeholder="名前"
              className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm"
              style={{ fontSize: "16px" }}
            />
            <button
              onClick={addCategory}
              disabled={!newCatName.trim()}
              className="bg-emerald-600 text-white px-4 py-2 rounded-lg text-sm font-bold disabled:opacity-50"
            >
              追加
            </button>
          </div>
        </div>
      </div>

      {/* Data Management */}
      <div className="bg-white rounded-2xl p-4 shadow-sm space-y-3">
        <h2 className="text-sm font-bold text-gray-700">データ管理</h2>
        <button
          onClick={exportCsv}
          disabled={exportingCsv}
          className="w-full py-2.5 rounded-xl text-sm font-bold bg-gray-100 text-gray-700"
        >
          {exportingCsv ? "エクスポート中..." : "CSVエクスポート（今月度）"}
        </button>
        <button
          onClick={() => setDeleteConfirm(true)}
          className="w-full py-2.5 rounded-xl text-sm font-bold bg-red-50 text-red-500"
        >
          全データ削除
        </button>
      </div>

      {saving && (
        <div className="fixed bottom-20 left-1/2 -translate-x-1/2 bg-gray-700 text-white px-4 py-2 rounded-full text-xs">
          保存中...
        </div>
      )}

      {toast && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 bg-gray-800 text-white px-6 py-3 rounded-full text-sm font-bold shadow-xl z-50">
          {toast}
        </div>
      )}

      {/* Delete All Confirmation */}
      {deleteConfirm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 px-6">
          <div className="bg-white rounded-2xl p-6 w-full max-w-sm space-y-4">
            <h2 className="text-base font-bold text-red-600">全データ削除</h2>
            <p className="text-sm text-gray-600">全ての支出記録を削除します。この操作は取り消せません。</p>
            <div className="flex gap-3">
              <button onClick={() => setDeleteConfirm(false)}
                className="flex-1 py-2.5 rounded-xl text-sm font-bold bg-gray-100 text-gray-700">キャンセル</button>
              <button onClick={deleteAllData}
                className="flex-1 py-2.5 rounded-xl text-sm font-bold bg-red-500 text-white">削除する</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
