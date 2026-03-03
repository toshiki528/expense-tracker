"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import type { PersonalSettings, PersonalCategory } from "@/lib/supabase";
import { getCurrentPeriod } from "@/lib/salary-cycle";

export default function SettingsPage() {
  const [settings, setSettings] = useState<PersonalSettings | null>(null);
  const [categories, setCategories] = useState<PersonalCategory[]>([]);
  const [savingsFromKakeibo, setSavingsFromKakeibo] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [newCatName, setNewCatName] = useState("");
  const [newCatIcon, setNewCatIcon] = useState("📌");
  const [toast, setToast] = useState<string | null>(null);
  const [exportingCsv, setExportingCsv] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState(false);
  const [deleteCatTarget, setDeleteCatTarget] = useState<PersonalCategory | null>(null);
  const [deletingCat, setDeletingCat] = useState(false);

  useEffect(() => { loadData(); }, []);

  async function loadData() {
    const period = getCurrentPeriod();

    const [
      { data: s },
      { data: cats },
      { data: savData },
    ] = await Promise.all([
      supabase.from("personal_settings").select("*").limit(1).single(),
      supabase.from("personal_categories").select("*").order("sort_order"),
      supabase.from("monthly_savings").select("amount").eq("year", period.year).eq("month", period.month).eq("person", "俊樹").single(),
    ]);

    setSettings(s as PersonalSettings);
    setCategories(cats || []);
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

  const deleteCategory = async (id: string) => {
    setDeletingCat(true);
    const { error } = await supabase.from("personal_categories").delete().eq("id", id);
    if (!error) {
      setCategories(categories.filter((c) => c.id !== id));
    }
    setDeletingCat(false);
    setDeleteCatTarget(null);
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
                <button
                  onClick={() => setDeleteCatTarget(cat)}
                  className="text-xs text-red-400 hover:text-red-600"
                >
                  削除
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

      {/* Delete Category Confirmation */}
      {deleteCatTarget && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 px-6">
          <div className="bg-white rounded-2xl p-6 w-full max-w-sm space-y-4">
            <h2 className="text-base font-bold text-gray-800">カテゴリの削除</h2>
            <p className="text-sm text-gray-600">
              「{deleteCatTarget.icon} {deleteCatTarget.name}」を完全に削除しますか？<br />
              この操作は取り消せません。
            </p>
            <div className="flex gap-3">
              <button onClick={() => setDeleteCatTarget(null)} disabled={deletingCat}
                className="flex-1 py-2.5 rounded-xl text-sm font-bold bg-gray-100 text-gray-700">キャンセル</button>
              <button onClick={() => deleteCategory(deleteCatTarget.id)} disabled={deletingCat}
                className="flex-1 py-2.5 rounded-xl text-sm font-bold bg-red-500 text-white disabled:opacity-50">
                {deletingCat ? "削除中..." : "削除する"}
              </button>
            </div>
          </div>
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
