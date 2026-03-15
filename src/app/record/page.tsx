"use client";

import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/lib/supabase";
import type { PersonalCategory } from "@/lib/supabase";

const SYNC_CATEGORIES = ["共通買い物", "個人消費"];

const PAYMENT_METHODS = [
  { key: "cash", label: "現金等", icon: "💴" },
  { key: "credit", label: "クレカ", icon: "💳" },
];

export default function RecordPage() {
  const [category, setCategory] = useState("");
  const [paymentMethod, setPaymentMethod] = useState(() => {
    if (typeof window !== "undefined") {
      return localStorage.getItem("lastPaymentMethod") || "cash";
    }
    return "cash";
  });
  const [date, setDate] = useState(() => new Date().toISOString().split("T")[0]);
  const [memo, setMemo] = useState("");
  const [categories, setCategories] = useState<PersonalCategory[]>([]);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  // Calculator state
  const [display, setDisplay] = useState("0");
  const [pendingValue, setPendingValue] = useState<number | null>(null);
  const [operator, setOperator] = useState<string | null>(null);
  const [justCalculated, setJustCalculated] = useState(false);

  const amount = display === "0" ? "" : display;

  const calcPress = useCallback((key: string) => {
    if (key === "C") {
      setDisplay("0");
      setPendingValue(null);
      setOperator(null);
      setJustCalculated(false);
      return;
    }
    if (key === "←") {
      setDisplay((d) => (d.length <= 1 ? "0" : d.slice(0, -1)));
      setJustCalculated(false);
      return;
    }
    if (key === "+" || key === "−") {
      const current = parseInt(display) || 0;
      if (pendingValue !== null && operator) {
        const result = operator === "+" ? pendingValue + current : pendingValue - current;
        setPendingValue(result);
        setDisplay(String(result));
      } else {
        setPendingValue(current);
      }
      setOperator(key);
      setJustCalculated(true);
      return;
    }
    if (key === "=") {
      if (pendingValue !== null && operator) {
        const current = parseInt(display) || 0;
        const result = operator === "+" ? pendingValue + current : pendingValue - current;
        setDisplay(String(Math.max(0, result)));
        setPendingValue(null);
        setOperator(null);
        setJustCalculated(true);
      }
      return;
    }
    // Number keys (0-9, 00)
    setDisplay((d) => {
      if (justCalculated) {
        setJustCalculated(false);
        return key === "00" ? "0" : key;
      }
      if (d === "0") return key === "00" ? "0" : key;
      if (d.length >= 8) return d;
      return d + key;
    });
  }, [display, pendingValue, operator, justCalculated]);

  useEffect(() => {
    loadCategories();
  }, []);

  async function loadCategories() {
    const { data } = await supabase
      .from("personal_categories")
      .select("*")
      .eq("is_active", true)
      .order("sort_order");
    setCategories((data || []).filter((c) => !SYNC_CATEGORIES.includes(c.name)));
  }

  const handleSave = async () => {
    const amountNum = parseInt(amount);
    if (!amountNum || !category) return;

    setSaving(true);
    const { error } = await supabase.from("personal_expenses").insert({
      amount: amountNum,
      category,
      payment_method: paymentMethod,
      memo: memo.trim() || null,
      expense_date: date,
    });

    if (!error) {
      localStorage.setItem("lastPaymentMethod", paymentMethod);
      setToast(`✓ ¥${amountNum.toLocaleString()} 記録しました`);
      setDisplay("0");
      setPendingValue(null);
      setOperator(null);
      setJustCalculated(false);
      setCategory("");
      setMemo("");
      setDate(new Date().toISOString().split("T")[0]);
      setTimeout(() => setToast(null), 2500);
    }
    setSaving(false);
  };

  return (
    <div className="w-full max-w-full overflow-x-hidden space-y-5 pb-4">
      <h1 className="text-lg font-bold text-gray-800">支出を記録</h1>

      {/* Amount + Calculator */}
      <div className="bg-white rounded-2xl p-4 shadow-sm">
        <label className="text-xs text-gray-500 block mb-2">金額</label>
        <div className="flex items-center gap-2 mb-1">
          <span className="text-2xl text-gray-400">¥</span>
          <span className="flex-1 min-w-0 text-3xl font-black text-gray-800" style={{ fontSize: "32px" }}>
            {display === "0" ? <span className="text-gray-300">0</span> : parseInt(display).toLocaleString()}
          </span>
          {operator && (
            <span className="text-lg font-bold text-emerald-600">{operator === "+" ? "+" : "−"}</span>
          )}
        </div>
        {/* Calculator keypad */}
        <div className="grid grid-cols-4 gap-2 mt-3">
          {[
            { k: "7", style: "num" }, { k: "8", style: "num" }, { k: "9", style: "num" }, { k: "←", style: "fn" },
            { k: "4", style: "num" }, { k: "5", style: "num" }, { k: "6", style: "num" }, { k: "C", style: "fn" },
            { k: "1", style: "num" }, { k: "2", style: "num" }, { k: "3", style: "num" }, { k: "−", style: "op" },
            { k: "0", style: "num" }, { k: "00", style: "num" }, { k: "=", style: "eq" }, { k: "+", style: "op" },
          ].map(({ k, style }) => (
            <button
              key={k}
              type="button"
              onClick={() => calcPress(k)}
              className={`py-3 rounded-xl text-base font-bold active:scale-95 transition ${
                style === "num" ? "bg-gray-100 text-gray-800" :
                style === "fn" ? "bg-gray-200 text-gray-600" :
                style === "op" ? "bg-emerald-100 text-emerald-700" :
                "bg-emerald-600 text-white"
              }`}
            >
              {k}
            </button>
          ))}
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
        <div className="grid grid-cols-2 gap-2">
          {PAYMENT_METHODS.map((pm) => (
            <button
              key={pm.key}
              onClick={() => setPaymentMethod(pm.key)}
              className={`py-3 rounded-xl text-sm font-bold transition ${
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
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2.5"
            style={{ fontSize: "16px" }}
          />
        </div>
        <div>
          <label className="text-xs text-gray-500 block mb-1">メモ</label>
          <input
            type="text"
            value={memo}
            onChange={(e) => setMemo(e.target.value)}
            placeholder="メモ（任意）"
            className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2.5"
            style={{ fontSize: "16px" }}
          />
        </div>
      </div>

      {/* Save Button */}
      <button
        onClick={handleSave}
        disabled={saving || !amount || !category}
        className="w-full py-4 rounded-2xl text-lg font-black bg-emerald-600 text-white disabled:opacity-40 shadow-lg active:scale-95 transition"
      >
        {saving ? "記録中..." : "記録する"}
      </button>

      {/* Toast */}
      {toast && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 bg-gray-800 text-white px-6 py-3 rounded-full text-sm font-bold shadow-xl z-50 animate-bounce">
          {toast}
        </div>
      )}
    </div>
  );
}
