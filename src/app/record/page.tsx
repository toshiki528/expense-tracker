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
      setToast(`¥${amountNum.toLocaleString()} 記録しました`);
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
      <div className="w-full max-w-full overflow-x-hidden space-y-4" style={{ paddingBottom: "340px" }}>
        {/* Amount display */}
        <div className="card p-5">
          <label className="text-xs font-light tracking-wide block mb-1" style={{ color: "var(--warm-gray-400)" }}>金額</label>
          {expression && (
            <p className="text-xs font-amount text-right mb-1" style={{ color: "var(--warm-gray-400)" }}>{expression}</p>
          )}
          <div className="flex items-baseline gap-2 justify-end">
            <span className="font-amount text-lg" style={{ color: "var(--warm-gray-300)" }}>¥</span>
            <span className="font-amount font-extrabold" style={{ fontSize: "38px", color: display === "0" ? "var(--warm-gray-200)" : "var(--ink)" }}>
              {display === "0" ? "0" : parseInt(display).toLocaleString()}
            </span>
          </div>
        </div>

        {/* Category */}
        <div className="card p-4">
          <label className="text-xs font-light tracking-wide block mb-3" style={{ color: "var(--warm-gray-400)" }}>カテゴリ</label>
          <div className="grid grid-cols-3 gap-2">
            {categories.map((cat) => (
              <button
                key={cat.id}
                type="button"
                onClick={() => { blurActive(); setCategory(cat.name); }}
                className="py-2.5 rounded text-xs font-medium transition-all relative"
                style={{
                  backgroundColor: category === cat.name ? "var(--accent-light)" : "var(--warm-gray-50)",
                  color: category === cat.name ? "var(--accent-dark)" : "var(--warm-gray-600)",
                  border: category === cat.name ? "1px solid var(--accent-muted)" : "1px solid transparent",
                }}
              >
                <span className="text-lg block">{cat.icon}</span>
                {cat.name}
                {category === cat.name && (
                  <span className="absolute bottom-0 left-1/2 -translate-x-1/2 w-6 h-[2px] rounded-full" style={{ backgroundColor: "var(--accent)" }} />
                )}
              </button>
            ))}
          </div>
        </div>

        {/* Payment Method */}
        <div className="card p-4">
          <label className="text-xs font-light tracking-wide block mb-3" style={{ color: "var(--warm-gray-400)" }}>支払い方法</label>
          <div className="grid grid-cols-2 gap-2">
            {PAYMENT_METHODS.map((pm) => (
              <button
                key={pm.key}
                type="button"
                onClick={() => { blurActive(); setPaymentMethod(pm.key); }}
                className="py-2.5 rounded text-xs font-medium transition-all"
                style={{
                  backgroundColor: paymentMethod === pm.key ? "var(--accent-light)" : "var(--warm-gray-50)",
                  color: paymentMethod === pm.key ? "var(--accent-dark)" : "var(--warm-gray-600)",
                  border: paymentMethod === pm.key ? "1px solid var(--accent-muted)" : "1px solid transparent",
                }}
              >
                {pm.icon} {pm.label}
              </button>
            ))}
          </div>
        </div>

        {/* Date & Memo - compact */}
        <div className="card p-4">
          <div className="flex gap-3">
            <div className="flex-1">
              <label className="text-xs font-light tracking-wide block mb-1.5" style={{ color: "var(--warm-gray-400)" }}>日付</label>
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="w-full text-sm rounded px-2.5 py-2 outline-none focus:ring-1"
                style={{ fontSize: "16px", border: "1px solid var(--border)", color: "var(--ink)" }}
              />
            </div>
            <div className="flex-1">
              <label className="text-xs font-light tracking-wide block mb-1.5" style={{ color: "var(--warm-gray-400)" }}>メモ</label>
              <input
                type="text"
                value={memo}
                onChange={(e) => setMemo(e.target.value)}
                placeholder="任意"
                className="w-full text-sm rounded px-2.5 py-2 outline-none focus:ring-1"
                style={{ fontSize: "16px", border: "1px solid var(--border)", color: "var(--ink)" }}
              />
            </div>
          </div>
        </div>
      </div>

      {/* Fixed calculator at bottom (above BottomNav) */}
      <div className="fixed left-0 right-0 z-40 px-3 pt-2 pb-2" style={{ bottom: "56px", backgroundColor: "var(--bg)", borderTop: "1px solid var(--border)" }}>
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
                className="font-amount font-bold select-none transition-all active:scale-[0.97]"
                style={{
                  height: "48px",
                  borderRadius: "4px",
                  fontSize: "16px",
                  backgroundColor:
                    s === "n" ? "var(--bg-card)" :
                    s === "f" ? "var(--warm-gray-100)" :
                    s === "o" ? "var(--accent-light)" :
                    s === "c" ? "var(--error-light)" :
                    "var(--accent)",
                  color:
                    s === "n" ? "var(--ink)" :
                    s === "f" ? "var(--warm-gray-600)" :
                    s === "o" ? "var(--accent-dark)" :
                    s === "c" ? "var(--error)" :
                    "#FFFFFF",
                  border: s === "n" ? "1px solid var(--border)" : "1px solid transparent",
                }}
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
            className="w-full py-3 text-base font-bold transition-all active:scale-[0.98] disabled:opacity-40"
            style={{
              borderRadius: "4px",
              backgroundColor: "var(--accent)",
              color: "#FFFFFF",
            }}
          >
            {saving ? "記録中..." : "記録する"}
          </button>
        </div>
      </div>

      {/* Toast */}
      {toast && (
        <div className="fixed top-4 left-1/2 toast-slide-in z-50 font-amount text-sm font-semibold px-6 py-3 rounded-lg"
          style={{ backgroundColor: "var(--ink)", color: "#FFFFFF", boxShadow: "0 4px 20px rgba(0,0,0,0.15)" }}>
          {toast}
        </div>
      )}
    </>
  );
}
