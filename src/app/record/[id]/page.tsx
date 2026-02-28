"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import type { PersonalCategory } from "@/lib/supabase";

const PAYMENT_METHODS = [
  { key: "cash", label: "現金", icon: "💴" },
  { key: "e-pay", label: "電子決済", icon: "📱" },
  { key: "ic-card", label: "交通IC", icon: "🚃" },
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
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-emerald-600" />
      </div>
    );
  }

  return (
    <div className="space-y-5 pb-4">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-bold text-gray-800">支出を編集</h1>
        <button onClick={() => router.back()} className="text-sm text-gray-500">戻る</button>
      </div>

      {/* Amount */}
      <div className="bg-white rounded-2xl p-5 shadow-sm">
        <label className="text-xs text-gray-500 block mb-2">金額</label>
        <div className="flex items-center gap-2">
          <span className="text-2xl text-gray-400">¥</span>
          <input
            type="number"
            inputMode="numeric"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            className="flex-1 text-4xl font-black text-gray-800 bg-transparent outline-none"
            style={{ fontSize: "36px" }}
          />
        </div>
      </div>

      {/* Category */}
      <div className="bg-white rounded-2xl p-4 shadow-sm">
        <label className="text-xs text-gray-500 block mb-3">カテゴリ</label>
        <div className="grid grid-cols-3 gap-2">
          {categories.map((cat) => (
            <button
              key={cat.id}
              onClick={() => setCategory(cat.name)}
              className={`py-3 rounded-xl text-sm font-bold transition ${
                category === cat.name
                  ? "bg-emerald-600 text-white shadow-md"
                  : "bg-gray-50 text-gray-700"
              }`}
            >
              <span className="text-xl block mb-0.5">{cat.icon}</span>
              {cat.name}
            </button>
          ))}
        </div>
      </div>

      {/* Payment Method */}
      <div className="bg-white rounded-2xl p-4 shadow-sm">
        <label className="text-xs text-gray-500 block mb-3">支払い方法</label>
        <div className="grid grid-cols-4 gap-1.5">
          {PAYMENT_METHODS.map((pm) => (
            <button
              key={pm.key}
              onClick={() => setPaymentMethod(pm.key)}
              className={`py-2 rounded-xl text-xs font-bold transition ${
                paymentMethod === pm.key
                  ? "bg-emerald-600 text-white"
                  : "bg-gray-50 text-gray-600"
              }`}
            >
              <span className="text-base block">{pm.icon}</span>
              {pm.label}
            </button>
          ))}
        </div>
      </div>

      {/* Date & Memo */}
      <div className="bg-white rounded-2xl p-4 shadow-sm space-y-3">
        <div>
          <label className="text-xs text-gray-500 block mb-1">日付</label>
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)}
            className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2.5" style={{ fontSize: "16px" }} />
        </div>
        <div>
          <label className="text-xs text-gray-500 block mb-1">メモ</label>
          <input type="text" value={memo} onChange={(e) => setMemo(e.target.value)}
            placeholder="メモ（任意）"
            className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2.5" style={{ fontSize: "16px" }} />
        </div>
      </div>

      {/* Actions */}
      <button
        onClick={handleSave}
        disabled={saving || !amount || !category}
        className="w-full py-4 rounded-2xl text-lg font-black bg-emerald-600 text-white disabled:opacity-40 shadow-lg"
      >
        {saving ? "保存中..." : "保存する"}
      </button>

      <button
        onClick={() => setDeleteTarget(true)}
        className="w-full py-3 rounded-2xl text-sm font-bold text-red-500 bg-red-50"
      >
        この記録を削除
      </button>

      {/* Delete Confirmation */}
      {deleteTarget && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 px-6">
          <div className="bg-white rounded-2xl p-6 w-full max-w-sm space-y-4">
            <h2 className="text-base font-bold text-gray-800">記録の削除</h2>
            <p className="text-sm text-gray-600">この支出記録を削除しますか？</p>
            <div className="flex gap-3">
              <button onClick={() => setDeleteTarget(false)}
                className="flex-1 py-2.5 rounded-xl text-sm font-bold bg-gray-100 text-gray-700">
                キャンセル
              </button>
              <button onClick={handleDelete}
                className="flex-1 py-2.5 rounded-xl text-sm font-bold bg-red-500 text-white">
                削除する
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
