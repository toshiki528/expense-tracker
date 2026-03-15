"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import type { PersonalCategory } from "@/lib/supabase";

const PAYMENT_METHODS = [
  { key: "cash", label: "現金等", icon: "💴" },
  { key: "credit", label: "クレカ", icon: "💳" },
];

export default function EditExpensePage() {
  const { id } = useParams();
  const router = useRouter();
  const [amount, setAmount] = useState("");
  const [category, setCategory] = useState("");
  const [paymentMethod, setPaymentMethod] = useState("e-pay");
  const [date, setDate] = useState("");
  const [memo, setMemo] = useState("");
  const [categories, setCategories] = useState<PersonalCategory[]>([]);
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadData();
  }, [id]);

  async function loadData() {
    const [{ data: expense }, { data: cats }] = await Promise.all([
      supabase.from("personal_expenses").select("*").eq("id", id).single(),
      supabase.from("personal_categories").select("*").eq("is_active", true).order("sort_order"),
    ]);
    if (expense) {
      setAmount(String(expense.amount));
      setCategory(expense.category);
      setPaymentMethod(expense.payment_method);
      setDate(expense.expense_date);
      setMemo(expense.memo || "");
    }
    setCategories(cats || []);
    setLoading(false);
  }

  const handleSave = async () => {
    const amountNum = parseInt(amount);
    if (!amountNum || !category) return;
    setSaving(true);
    await supabase.from("personal_expenses").update({
      amount: amountNum,
      category,
      payment_method: paymentMethod,
      memo: memo.trim() || null,
      expense_date: date,
      updated_at: new Date().toISOString(),
    }).eq("id", id);
    setSaving(false);
    router.push("/");
  };

  const handleDelete = async () => {
    await supabase.from("personal_expenses").delete().eq("id", id);
    router.push("/");
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2" style={{ borderColor: "var(--accent)" }} />
      </div>
    );
  }

  return (
    <div className="space-y-6 pb-4">
      <div className="flex items-center justify-between">
        <h1 className="text-base font-medium" style={{ color: "var(--ink)" }}>支出を編集</h1>
        <button onClick={() => router.back()} className="text-sm font-light" style={{ color: "var(--warm-gray-400)" }}>戻る</button>
      </div>

      {/* Amount */}
      <div className="card p-5">
        <label className="text-xs font-light tracking-wide block mb-2" style={{ color: "var(--warm-gray-400)" }}>金額</label>
        <div className="flex items-center gap-2">
          <span className="font-amount text-xl" style={{ color: "var(--warm-gray-300)" }}>¥</span>
          <input
            type="number"
            inputMode="numeric"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            className="flex-1 font-amount font-extrabold bg-transparent outline-none"
            style={{ fontSize: "36px", color: "var(--ink)" }}
          />
        </div>
      </div>

      {/* Category */}
      <div className="card p-5">
        <label className="text-xs font-light tracking-wide block mb-3" style={{ color: "var(--warm-gray-400)" }}>カテゴリ</label>
        <div className="grid grid-cols-3 gap-2">
          {categories.map((cat) => (
            <button
              key={cat.id}
              onClick={() => setCategory(cat.name)}
              className="py-3 rounded text-sm font-medium transition-all relative"
              style={{
                backgroundColor: category === cat.name ? "var(--accent-light)" : "var(--warm-gray-50)",
                color: category === cat.name ? "var(--accent-dark)" : "var(--warm-gray-600)",
                border: category === cat.name ? "1px solid var(--accent-muted)" : "1px solid transparent",
              }}
            >
              <span className="text-xl block mb-0.5">{cat.icon}</span>
              {cat.name}
              {category === cat.name && (
                <span className="absolute bottom-0 left-1/2 -translate-x-1/2 w-6 h-[2px] rounded-full" style={{ backgroundColor: "var(--accent)" }} />
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Payment Method */}
      <div className="card p-5">
        <label className="text-xs font-light tracking-wide block mb-3" style={{ color: "var(--warm-gray-400)" }}>支払い方法</label>
        <div className="grid grid-cols-2 gap-2">
          {PAYMENT_METHODS.map((pm) => (
            <button
              key={pm.key}
              onClick={() => setPaymentMethod(pm.key)}
              className="py-3 rounded text-sm font-medium transition-all"
              style={{
                backgroundColor: paymentMethod === pm.key ? "var(--accent-light)" : "var(--warm-gray-50)",
                color: paymentMethod === pm.key ? "var(--accent-dark)" : "var(--warm-gray-600)",
                border: paymentMethod === pm.key ? "1px solid var(--accent-muted)" : "1px solid transparent",
              }}
            >
              <span className="text-base block">{pm.icon}</span>
              {pm.label}
            </button>
          ))}
        </div>
      </div>

      {/* Date & Memo */}
      <div className="card p-5 space-y-4">
        <div>
          <label className="text-xs font-light tracking-wide block mb-1.5" style={{ color: "var(--warm-gray-400)" }}>日付</label>
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)}
            className="w-full text-sm rounded px-3 py-2.5 outline-none"
            style={{ fontSize: "16px", border: "1px solid var(--border)", color: "var(--ink)" }} />
        </div>
        <div>
          <label className="text-xs font-light tracking-wide block mb-1.5" style={{ color: "var(--warm-gray-400)" }}>メモ</label>
          <input type="text" value={memo} onChange={(e) => setMemo(e.target.value)}
            placeholder="メモ（任意）"
            className="w-full text-sm rounded px-3 py-2.5 outline-none"
            style={{ fontSize: "16px", border: "1px solid var(--border)", color: "var(--ink)" }} />
        </div>
      </div>

      {/* Actions */}
      <button
        onClick={handleSave}
        disabled={saving || !amount || !category}
        className="w-full py-4 text-base font-bold disabled:opacity-40 transition-all active:scale-[0.98]"
        style={{ borderRadius: "4px", backgroundColor: "var(--accent)", color: "#FFFFFF" }}
      >
        {saving ? "保存中..." : "保存する"}
      </button>

      <button
        onClick={() => setDeleteTarget(true)}
        className="w-full py-3 text-sm font-medium rounded"
        style={{ backgroundColor: "var(--error-light)", color: "var(--error)" }}
      >
        この記録を削除
      </button>

      {/* Delete Confirmation */}
      {deleteTarget && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 px-6">
          <div className="card p-6 w-full max-w-sm space-y-4">
            <h2 className="text-base font-medium" style={{ color: "var(--ink)" }}>記録の削除</h2>
            <p className="text-sm" style={{ color: "var(--warm-gray-600)" }}>この支出記録を削除しますか？</p>
            <div className="flex gap-3">
              <button onClick={() => setDeleteTarget(false)}
                className="flex-1 py-2.5 rounded text-sm font-medium"
                style={{ backgroundColor: "var(--warm-gray-100)", color: "var(--ink-light)" }}>
                キャンセル
              </button>
              <button onClick={handleDelete}
                className="flex-1 py-2.5 rounded text-sm font-medium"
                style={{ backgroundColor: "var(--error)", color: "#FFFFFF" }}>
                削除する
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
