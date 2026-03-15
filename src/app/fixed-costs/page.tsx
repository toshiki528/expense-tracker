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
        <div className="animate-spin rounded-full h-8 w-8 border-b-2" style={{ borderColor: "var(--accent)" }} />
      </div>
    );
  }

  return (
    <div className="space-y-6 pb-8">
      <h1 className="text-base font-medium" style={{ color: "var(--ink)" }}>固定費</h1>

      {/* Shared Fixed Costs (read-only) */}
      <div className="card p-5 space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-medium" style={{ color: "var(--ink)" }}>共通固定費</h2>
          <span className="text-[10px] px-2 py-0.5 rounded-full" style={{ color: "var(--accent)", backgroundColor: "var(--accent-light)" }}>ワリカンから取得</span>
        </div>
        <div className="space-y-2">
          {sharedCosts.map((c) => (
            <div key={c.id} className="flex justify-between text-sm">
              <span style={{ color: "var(--warm-gray-600)" }}>{c.name}</span>
              <span className="font-amount font-medium" style={{ color: "var(--ink)" }}>¥{c.amount.toLocaleString()}</span>
            </div>
          ))}
        </div>
        <div style={{ borderTop: "1px solid var(--border)", paddingTop: "10px" }} className="space-y-1.5">
          <div className="flex justify-between text-sm font-medium">
            <span style={{ color: "var(--ink)" }}>合計</span>
            <span className="font-amount" style={{ color: "var(--ink)" }}>¥{sharedTotal.toLocaleString()}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span style={{ color: "var(--accent)" }}>俊樹負担（÷2）</span>
            <span className="font-amount font-bold" style={{ color: "var(--accent)" }}>¥{sharedMyShare.toLocaleString()}</span>
          </div>
        </div>
        <p className="text-[10px]" style={{ color: "var(--warm-gray-400)" }}>変更はワリカンアプリで行ってください</p>
      </div>

      {/* Personal Fixed Costs */}
      <div className="card p-5 space-y-3">
        <h2 className="text-sm font-medium" style={{ color: "var(--ink)" }}>個人固定費</h2>
        <div className="space-y-3">
          {personalCosts.map((cost) => (
            <div
              key={cost.id}
              className={`rounded-lg p-3.5 space-y-2 ${!cost.is_active ? "opacity-50" : ""}`}
              style={{ border: "1px solid var(--border)" }}
            >
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium" style={{ color: "var(--ink)" }}>{cost.name}</span>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => updatePersonalCost(cost.id, "is_active", !cost.is_active)}
                    className="relative w-10 h-5 rounded-full transition"
                    style={{ backgroundColor: cost.is_active ? "var(--accent)" : "var(--warm-gray-300)" }}
                  >
                    <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${cost.is_active ? "left-5" : "left-0.5"}`} />
                  </button>
                  <button onClick={() => setDeleteTarget(cost)} className="text-xs" style={{ color: "var(--error)" }}>削除</button>
                </div>
              </div>
              <div className="flex items-center gap-1">
                <span className="font-amount text-sm" style={{ color: "var(--warm-gray-300)" }}>¥</span>
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
                  className="flex-1 text-sm font-amount font-semibold py-1.5 outline-none bg-transparent"
                  style={{ fontSize: "16px", borderBottom: "1px solid var(--border)", color: "var(--ink)" }}
                />
                <span className="text-xs" style={{ color: "var(--warm-gray-400)" }}>/月</span>
              </div>
              {saving === cost.id && <p className="text-xs" style={{ color: "var(--warm-gray-400)" }}>保存中...</p>}
            </div>
          ))}
        </div>

        {/* Add new */}
        <div style={{ borderTop: "1px solid var(--border)", paddingTop: "12px" }}>
          <div className="flex gap-2">
            <input
              type="text"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="項目名（例: ジム）"
              className="flex-1 text-sm rounded px-3 py-2 outline-none"
              style={{ fontSize: "16px", border: "1px solid var(--border)", color: "var(--ink)" }}
              onKeyDown={(e) => e.key === "Enter" && addPersonalCost()}
            />
            <button
              onClick={addPersonalCost}
              disabled={adding || !newName.trim()}
              className="px-4 py-2 rounded text-sm font-medium disabled:opacity-50"
              style={{ backgroundColor: "var(--accent)", color: "#FFFFFF" }}
            >
              追加
            </button>
          </div>
        </div>
      </div>

      {/* Summary */}
      <div className="card p-5 space-y-2" style={{ backgroundColor: "var(--accent-light)" }}>
        <h2 className="text-xs font-light tracking-widest mb-3" style={{ color: "var(--warm-gray-500)" }}>固定費サマリー</h2>
        <div className="flex justify-between text-sm">
          <span style={{ color: "var(--warm-gray-600)" }}>共通固定費（俊樹負担）</span>
          <span className="font-amount font-semibold" style={{ color: "var(--ink)" }}>¥{sharedMyShare.toLocaleString()}</span>
        </div>
        <div className="flex justify-between text-sm">
          <span style={{ color: "var(--warm-gray-600)" }}>個人固定費</span>
          <span className="font-amount font-semibold" style={{ color: "var(--ink)" }}>¥{personalTotal.toLocaleString()}</span>
        </div>
        <div className="flex justify-between text-sm font-bold pt-2" style={{ borderTop: "1px solid var(--accent-muted)", color: "var(--accent-dark)" }}>
          <span>固定費合計</span>
          <span className="font-amount">¥{(sharedMyShare + personalTotal).toLocaleString()}</span>
        </div>
      </div>

      {/* Delete confirmation */}
      {deleteTarget && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 px-6">
          <div className="card p-6 w-full max-w-sm space-y-4">
            <h2 className="text-base font-medium" style={{ color: "var(--ink)" }}>固定費の削除</h2>
            <p className="text-sm" style={{ color: "var(--warm-gray-600)" }}>「{deleteTarget.name}」を完全に削除しますか？<br />この操作は取り消せません。</p>
            <div className="flex gap-3">
              <button onClick={() => setDeleteTarget(null)} disabled={deleting}
                className="flex-1 py-2.5 rounded text-sm font-medium"
                style={{ backgroundColor: "var(--warm-gray-100)", color: "var(--ink-light)" }}>キャンセル</button>
              <button onClick={() => deleteCost(deleteTarget.id)} disabled={deleting}
                className="flex-1 py-2.5 rounded text-sm font-medium disabled:opacity-50"
                style={{ backgroundColor: "var(--error)", color: "#FFFFFF" }}>
                {deleting ? "削除中..." : "削除する"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
