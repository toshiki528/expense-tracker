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
      if (freshRef.current) return;
      setDisplay((d) => (d.length <= 1 ? "0" : d.slice(0, -1)));
      return;
    }
    if (key === "+" || key === "-") {
      const current = parseInt(display) || 0;
      if (pendingRef.current !== null && opRef.current && !freshRef.current) {
        const result =
          opRef.current === "+"
            ? pendingRef.current + current
            : pendingRef.current - current;
        pendingRef.current = result;
        opRef.current = key;
        freshRef.current = true;
        const sym = key === "+" ? "+" : "−";
        setExpression(`${result.toLocaleString()} ${sym}`);
        setDisplay(String(result));
      } else {
        pendingRef.current = current;
        opRef.current = key;
        freshRef.current = true;
        const sym = key === "+" ? "+" : "−";
        setExpression(`${current.toLocaleString()} ${sym}`);
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
        pendingRef.current = null;
        opRef.current = null;
        freshRef.current = true;
        setExpression(null);
        setDisplay(String(Math.max(0, result)));
      }
      return;
    }
    // Number keys: 0-9, 00
    if (freshRef.current) {
      freshRef.current = false;
      const digit = key === "00" ? "0" : key;
      if (pendingRef.current !== null && opRef.current) {
        const sym = opRef.current === "+" ? "+" : "−";
        setExpression(`${pendingRef.current.toLocaleString()} ${sym} ${digit}`);
      }
      setDisplay(digit);
    } else {
      setDisplay((d) => {
        if (d === "0") {
          const v = key === "00" ? "0" : key;
          if (pendingRef.current !== null && opRef.current) {
            const sym = opRef.current === "+" ? "+" : "−";
            setExpression(`${pendingRef.current.toLocaleString()} ${sym} ${v}`);
          }
          return v;
        }
        if (d.length >= 8) return d;
        const v = d + key;
        if (pendingRef.current !== null && opRef.current) {
          const sym = opRef.current === "+" ? "+" : "−";
          setExpression(`${pendingRef.current.toLocaleString()} ${sym} ${parseInt(v).toLocaleString()}`);
        }
        return v;
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

  return (
    <>
      {/* Scrollable content area - extra padding for fixed calculator + BottomNav */}
      <div className="w-full max-w-full overflow-x-hidden space-y-3" style={{ paddingBottom: "340px" }}>
        {/* Amount display */}
        <div className="bg-white rounded-2xl p-4 shadow-sm">
          <label className="text-xs text-gray-500 block mb-1">金額</label>
          {expression && (
            <p className="text-xs text-gray-400 text-right mb-0.5">{expression}</p>
          )}
          <div className="flex items-baseline gap-2 justify-end">
            <span className="text-xl text-gray-400">¥</span>
            <span className="text-4xl font-black text-gray-800 tabular-nums" style={{ fontSize: "36px" }}>
              {display === "0" ? (
                <span className="text-gray-300">0</span>
              ) : (
                parseInt(display).toLocaleString()
              )}
            </span>
          </div>
        </div>

        {/* Category */}
        <div className="bg-white rounded-2xl p-3 shadow-sm">
          <label className="text-xs text-gray-500 block mb-2">カテゴリ</label>
          <div className="grid grid-cols-3 gap-1.5">
            {categories.map((cat) => (
              <button
                key={cat.id}
                type="button"
                onClick={() => { blurActive(); setCategory(cat.name); }}
                className={`py-2 rounded-xl text-xs font-bold transition ${
                  category === cat.name
                    ? "bg-emerald-600 text-white shadow-md"
                    : "bg-gray-50 text-gray-700"
                }`}
              >
                <span className="text-lg block">{cat.icon}</span>
                {cat.name}
              </button>
            ))}
          </div>
        </div>

        {/* Payment Method */}
        <div className="bg-white rounded-2xl p-3 shadow-sm">
          <label className="text-xs text-gray-500 block mb-2">支払い方法</label>
          <div className="grid grid-cols-2 gap-2">
            {PAYMENT_METHODS.map((pm) => (
              <button
                key={pm.key}
                type="button"
                onClick={() => { blurActive(); setPaymentMethod(pm.key); }}
                className={`py-2 rounded-xl text-xs font-bold transition ${
                  paymentMethod === pm.key
                    ? "bg-emerald-600 text-white"
                    : "bg-gray-50 text-gray-600"
                }`}
              >
                {pm.icon} {pm.label}
              </button>
            ))}
          </div>
        </div>

        {/* Date & Memo - compact */}
        <div className="bg-white rounded-2xl p-3 shadow-sm">
          <div className="flex gap-2">
            <div className="flex-1">
              <label className="text-xs text-gray-500 block mb-1">日付</label>
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="w-full text-sm border border-gray-200 rounded-lg px-2 py-2"
                style={{ fontSize: "16px" }}
              />
            </div>
            <div className="flex-1">
              <label className="text-xs text-gray-500 block mb-1">メモ</label>
              <input
                type="text"
                value={memo}
                onChange={(e) => setMemo(e.target.value)}
                placeholder="任意"
                className="w-full text-sm border border-gray-200 rounded-lg px-2 py-2"
                style={{ fontSize: "16px" }}
              />
            </div>
          </div>
        </div>
      </div>

      {/* Fixed calculator at bottom (above BottomNav) */}
      <div className="fixed left-0 right-0 z-40 bg-gray-50 border-t border-gray-200 px-3 pt-2 pb-2" style={{ bottom: "56px" }}>
        <div className="max-w-lg mx-auto">
          {/* Keypad */}
          <div className="grid grid-cols-4 gap-1.5 mb-2">
            {[
              { k: "7", l: "7", s: "n" }, { k: "8", l: "8", s: "n" }, { k: "9", l: "9", s: "n" }, { k: "back", l: "⌫", s: "f" },
              { k: "4", l: "4", s: "n" }, { k: "5", l: "5", s: "n" }, { k: "6", l: "6", s: "n" }, { k: "+", l: "+", s: "o" },
              { k: "1", l: "1", s: "n" }, { k: "2", l: "2", s: "n" }, { k: "3", l: "3", s: "n" }, { k: "-", l: "−", s: "o" },
              { k: "C", l: "C", s: "c" }, { k: "0", l: "0", s: "n" }, { k: "00", l: "00", s: "n" }, { k: "=", l: "=", s: "e" },
            ].map(({ k, l, s }) => (
              <button
                key={k}
                type="button"
                onClick={() => calcPress(k)}
                className={`rounded-xl font-bold active:scale-95 transition select-none text-base ${
                  s === "n" ? "bg-white text-gray-800 shadow-sm" :
                  s === "f" ? "bg-gray-200 text-gray-600" :
                  s === "o" ? "bg-emerald-100 text-emerald-700" :
                  s === "c" ? "bg-red-100 text-red-600" :
                  "bg-emerald-600 text-white shadow-sm"
                }`}
                style={{ height: "48px" }}
              >
                {l}
              </button>
            ))}
          </div>
          {/* Save */}
          <button
            type="button"
            onClick={handleSave}
            disabled={saving || !amount || !category}
            className="w-full py-3 rounded-xl text-base font-black bg-emerald-600 text-white disabled:opacity-40 shadow-md active:scale-95 transition"
          >
            {saving ? "記録中..." : "記録する"}
          </button>
        </div>
      </div>

      {/* Toast */}
      {toast && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 bg-gray-800 text-white px-6 py-3 rounded-full text-sm font-bold shadow-xl z-50 animate-bounce">
          {toast}
        </div>
      )}
    </>
  );
}
