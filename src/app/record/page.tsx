"use client";

import { useEffect, useState, useRef } from "react";
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
  const [expression, setExpression] = useState<string | null>(null);
  const pendingRef = useRef<number | null>(null);
  const opRef = useRef<string | null>(null);
  const freshRef = useRef(false);

  const amount = display === "0" ? "" : display;

  // Blur any focused element to prevent OS keyboard
  const blurActive = () => {
    if (document.activeElement instanceof HTMLElement) {
      document.activeElement.blur();
    }
  };

  const resetCalc = () => {
    setDisplay("0");
    setExpression(null);
    pendingRef.current = null;
    opRef.current = null;
    freshRef.current = false;
  };

  const calcPress = (key: string) => {
    blurActive();

    if (key === "C") {
      resetCalc();
      return;
    }

    if (key === "back") {
      if (freshRef.current) return; // don't delete after = or op
      setDisplay((d) => (d.length <= 1 ? "0" : d.slice(0, -1)));
      return;
    }

    if (key === "+" || key === "-") {
      const current = parseInt(display) || 0;

      if (pendingRef.current !== null && opRef.current && !freshRef.current) {
        // Chain: compute previous, then set new op
        const result =
          opRef.current === "+"
            ? pendingRef.current + current
            : pendingRef.current - current;
        pendingRef.current = result;
        opRef.current = key;
        freshRef.current = true;
        const opSymbol = key === "+" ? "+" : "−";
        setExpression(`${result.toLocaleString()} ${opSymbol}`);
        setDisplay(String(result));
      } else {
        pendingRef.current = current;
        opRef.current = key;
        freshRef.current = true;
        const opSymbol = key === "+" ? "+" : "−";
        setExpression(`${current.toLocaleString()} ${opSymbol}`);
      }
      return;
    }

    if (key === "=") {
      if (pendingRef.current !== null && opRef.current) {
        const current = parseInt(display) || 0;
        const result =
          opRef.current === "+"
            ? pendingRef.current + current
            : pendingRef.current - current;
        const safeResult = Math.max(0, result);
        pendingRef.current = null;
        opRef.current = null;
        freshRef.current = true;
        setExpression(null);
        setDisplay(String(safeResult));
      }
      return;
    }

    // Number keys: 0-9, 00
    if (freshRef.current) {
      freshRef.current = false;
      // Update expression to show the new number being typed
      if (pendingRef.current !== null && opRef.current) {
        const opSymbol = opRef.current === "+" ? "+" : "−";
        const newDigit = key === "00" ? "0" : key;
        setExpression(`${pendingRef.current.toLocaleString()} ${opSymbol} ${newDigit}`);
      }
      setDisplay(key === "00" ? "0" : key);
    } else {
      setDisplay((d) => {
        if (d === "0") {
          const newVal = key === "00" ? "0" : key;
          if (pendingRef.current !== null && opRef.current) {
            const opSymbol = opRef.current === "+" ? "+" : "−";
            setExpression(`${pendingRef.current.toLocaleString()} ${opSymbol} ${newVal}`);
          }
          return newVal;
        }
        if (d.length >= 8) return d;
        const newVal = d + key;
        if (pendingRef.current !== null && opRef.current) {
          const opSymbol = opRef.current === "+" ? "+" : "−";
          setExpression(
            `${pendingRef.current.toLocaleString()} ${opSymbol} ${parseInt(newVal).toLocaleString()}`
          );
        }
        return newVal;
      });
    }
  };

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
    blurActive();
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
      resetCalc();
      setCategory("");
      setMemo("");
      setDate(new Date().toISOString().split("T")[0]);
      setTimeout(() => setToast(null), 2500);
    }
    setSaving(false);
  };

  const CAL_KEYS = [
    { k: "7", label: "7", s: "num" },
    { k: "8", label: "8", s: "num" },
    { k: "9", label: "9", s: "num" },
    { k: "back", label: "⌫", s: "fn" },
    { k: "4", label: "4", s: "num" },
    { k: "5", label: "5", s: "num" },
    { k: "6", label: "6", s: "num" },
    { k: "+", label: "+", s: "op" },
    { k: "1", label: "1", s: "num" },
    { k: "2", label: "2", s: "num" },
    { k: "3", label: "3", s: "num" },
    { k: "-", label: "−", s: "op" },
    { k: "C", label: "C", s: "clear" },
    { k: "0", label: "0", s: "num" },
    { k: "00", label: "00", s: "num" },
    { k: "=", label: "=", s: "eq" },
  ];

  return (
    <div className="w-full max-w-full overflow-x-hidden flex flex-col pb-4">
      {/* Amount display */}
      <div className="bg-white rounded-2xl p-4 shadow-sm mb-4">
        <label className="text-xs text-gray-500 block mb-1">金額</label>
        {expression && (
          <p className="text-xs text-gray-400 text-right mb-0.5">{expression}</p>
        )}
        <div className="flex items-baseline gap-2 justify-end">
          <span className="text-xl text-gray-400">¥</span>
          <span
            className="text-4xl font-black text-gray-800 tabular-nums"
            style={{ fontSize: "36px", lineHeight: 1.2 }}
          >
            {display === "0" ? (
              <span className="text-gray-300">0</span>
            ) : (
              parseInt(display).toLocaleString()
            )}
          </span>
        </div>
      </div>

      {/* Category */}
      <div className="bg-white rounded-2xl p-4 shadow-sm mb-4">
        <label className="text-xs text-gray-500 block mb-3">カテゴリ</label>
        <div className="grid grid-cols-3 gap-2">
          {categories.map((cat) => (
            <button
              key={cat.id}
              type="button"
              onClick={() => { blurActive(); setCategory(cat.name); }}
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
      <div className="bg-white rounded-2xl p-4 shadow-sm mb-4">
        <label className="text-xs text-gray-500 block mb-3">支払い方法</label>
        <div className="grid grid-cols-2 gap-2">
          {PAYMENT_METHODS.map((pm) => (
            <button
              key={pm.key}
              type="button"
              onClick={() => { blurActive(); setPaymentMethod(pm.key); }}
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
      <div className="bg-white rounded-2xl p-4 shadow-sm mb-4 space-y-3">
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

      {/* Calculator keypad - fixed bottom area */}
      <div className="bg-white rounded-2xl p-3 shadow-sm mb-3">
        <div className="grid grid-cols-4 gap-2">
          {CAL_KEYS.map(({ k, label, s }) => (
            <button
              key={k}
              type="button"
              onClick={() => calcPress(k)}
              className={`rounded-xl text-lg font-bold active:scale-95 transition select-none ${
                s === "num"
                  ? "bg-gray-100 text-gray-800"
                  : s === "fn"
                    ? "bg-gray-200 text-gray-600"
                    : s === "op"
                      ? "bg-emerald-100 text-emerald-700"
                      : s === "clear"
                        ? "bg-red-100 text-red-600"
                        : "bg-emerald-600 text-white"
              }`}
              style={{ minHeight: "52px" }}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Save Button */}
      <button
        type="button"
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
