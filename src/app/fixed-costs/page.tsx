"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import type { FixedCost, PersonalFixedCost } from "@/lib/supabase";

export default function FixedCostsPage() {
  const [sharedCosts, setSharedCosts] = useState<FixedCost[]>([]);
  const [personalCosts, setPersonalCosts] = useState<PersonalFixedCost[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [newName, setNewName] = useState("");
  const [adding, setAdding] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<PersonalFixedCost | null>(null);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => { loadData(); }, []);

  async function loadData() {
    const [{ data: shared }, { data: personal }] = await Promise.all([
      supabase.from("fixed_costs").select("*").eq("is_active", true).order("sort_order"),
      supabase.from("personal_fixed_costs").select("*").order("sort_order"),
    ]);
    setSharedCosts(shared || []);
    setPersonalCosts(personal || []);
    setLoading(false);
  }

  const updatePersonalCost = async (id: string, field: string, value: string | number | boolean) => {
    setSaving(id);
    await supabase.from("personal_fixed_costs").update({ [field]: value, updated_at: new Date().toISOString() }).eq("id", id);
    setPersonalCosts((prev) => prev.map((c) => (c.id === id ? { ...c, [field]: value } : c)));
    setSaving(null);
  };

  const addPersonalCost = async () => {
    if (!newName.trim()) return;
    setAdding(true);
    const maxOrder = personalCosts.length > 0 ? Math.max(...personalCosts.map((c) => c.sort_order)) : 0;
    const { data } = await supabase.from("personal_fixed_costs")
      .insert({ name: newName.trim(), amount: 0, is_active: true, sort_order: maxOrder + 1 })
      .select().single();
    if (data) setPersonalCosts([...personalCosts, data as PersonalFixedCost]);
    setNewName("");
    setAdding(false);
  };

  const deleteCost = async (id: string) => {
    setDeleting(true);
    const { error } = await supabase.from("personal_fixed_costs").delete().eq("id", id);
    if (!error) setPersonalCosts(personalCosts.filter((c) => c.id !== id));
    setDeleting(false);
    setDeleteTarget(null);
  };

  const sharedTotal = sharedCosts.reduce((s, c) => s + c.amount, 0);
  const sharedMyShare = Math.floor(sharedTotal / 2);
  const personalTotal = personalCosts.filter((c) => c.is_active).reduce((s, c) => s + c.amount, 0);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-emerald-600" />
      </div>
    );
  }

  return (
    <div className="space-y-4 pb-8">
      <h1 className="text-lg font-bold text-gray-800">固定費</h1>

      {/* Shared Fixed Costs (read-only) */}
      <div className="bg-white rounded-2xl p-4 shadow-sm space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-bold text-gray-700">共通固定費</h2>
          <span className="text-[10px] text-emerald-500 bg-emerald-50 px-2 py-0.5 rounded-full">ワリカンから取得</span>
        </div>
        <div className="space-y-1">
          {sharedCosts.map((c) => (
            <div key={c.id} className="flex justify-between text-sm">
              <span className="text-gray-600">{c.name}</span>
              <span className="text-gray-700">¥{c.amount.toLocaleString()}</span>
            </div>
          ))}
        </div>
        <div className="border-t pt-2 space-y-1">
          <div className="flex justify-between text-sm font-bold">
            <span>合計</span>
            <span>¥{sharedTotal.toLocaleString()}</span>
          </div>
          <div className="flex justify-between text-sm text-emerald-700">
            <span>俊樹負担（÷2）</span>
            <span className="font-bold">¥{sharedMyShare.toLocaleString()}</span>
          </div>
        </div>
        <p className="text-[10px] text-gray-400">変更はワリカンアプリで行ってください</p>
      </div>

      {/* Personal Fixed Costs */}
      <div className="bg-white rounded-2xl p-4 shadow-sm space-y-3">
        <h2 className="text-sm font-bold text-gray-700">個人固定費</h2>
        <div className="space-y-2">
          {personalCosts.map((cost) => (
            <div
              key={cost.id}
              className={`border border-gray-100 rounded-xl p-3 space-y-2 ${!cost.is_active ? "opacity-50" : ""}`}
            >
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-gray-800">{cost.name}</span>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => updatePersonalCost(cost.id, "is_active", !cost.is_active)}
                    className={`relative w-10 h-5 rounded-full transition ${cost.is_active ? "bg-emerald-600" : "bg-gray-300"}`}
                  >
                    <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${cost.is_active ? "left-5" : "left-0.5"}`} />
                  </button>
                  <button onClick={() => setDeleteTarget(cost)} className="text-xs text-red-400 hover:text-red-600">削除</button>
                </div>
              </div>
              <div className="flex items-center gap-1">
                <span className="text-gray-400 text-sm">¥</span>
                <input
                  type="number"
                  inputMode="numeric"
                  value={cost.amount || ""}
                  onChange={(e) => {
                    const val = parseInt(e.target.value) || 0;
                    setPersonalCosts(personalCosts.map((c) => (c.id === cost.id ? { ...c, amount: val } : c)));
                  }}
                  onBlur={(e) => updatePersonalCost(cost.id, "amount", parseInt(e.target.value) || 0)}
                  placeholder="0"
                  className="flex-1 text-sm font-semibold py-1.5 border-0 border-b border-gray-200 focus:border-emerald-500 focus:outline-none bg-transparent"
                  style={{ fontSize: "16px" }}
                />
                <span className="text-xs text-gray-400">/月</span>
              </div>
              {saving === cost.id && <p className="text-xs text-gray-400">保存中...</p>}
            </div>
          ))}
        </div>

        {/* Add new */}
        <div className="border-t pt-3">
          <div className="flex gap-2">
            <input
              type="text"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="項目名（例: ジム）"
              className="flex-1 text-sm border border-gray-200 rounded-lg px-3 py-2"
              style={{ fontSize: "16px" }}
              onKeyDown={(e) => e.key === "Enter" && addPersonalCost()}
            />
            <button
              onClick={addPersonalCost}
              disabled={adding || !newName.trim()}
              className="bg-emerald-600 text-white px-4 py-2 rounded-lg text-sm font-bold disabled:opacity-50"
            >
              追加
            </button>
          </div>
        </div>
      </div>

      {/* Summary */}
      <div className="bg-emerald-50 rounded-2xl p-4 space-y-1">
        <h2 className="text-xs font-bold text-gray-500 mb-2">固定費サマリー</h2>
        <div className="flex justify-between text-sm">
          <span className="text-gray-600">共通固定費（俊樹負担）</span>
          <span className="font-semibold">¥{sharedMyShare.toLocaleString()}</span>
        </div>
        <div className="flex justify-between text-sm">
          <span className="text-gray-600">個人固定費</span>
          <span className="font-semibold">¥{personalTotal.toLocaleString()}</span>
        </div>
        <div className="border-t border-emerald-200 pt-1 mt-1 flex justify-between text-sm font-bold text-emerald-700">
          <span>固定費合計</span>
          <span>¥{(sharedMyShare + personalTotal).toLocaleString()}</span>
        </div>
      </div>

      {/* Delete confirmation */}
      {deleteTarget && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 px-6">
          <div className="bg-white rounded-2xl p-6 w-full max-w-sm space-y-4">
            <h2 className="text-base font-bold text-gray-800">固定費の削除</h2>
            <p className="text-sm text-gray-600">「{deleteTarget.name}」を完全に削除しますか？<br />この操作は取り消せません。</p>
            <div className="flex gap-3">
              <button onClick={() => setDeleteTarget(null)} disabled={deleting}
                className="flex-1 py-2.5 rounded-xl text-sm font-bold bg-gray-100 text-gray-700">キャンセル</button>
              <button onClick={() => deleteCost(deleteTarget.id)} disabled={deleting}
                className="flex-1 py-2.5 rounded-xl text-sm font-bold bg-red-500 text-white disabled:opacity-50">
                {deleting ? "削除中..." : "削除する"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
