"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";
import { getAdjacentPeriod, getCurrentPeriod } from "@/lib/salary-cycle";
import {
  formatDateLabel,
  getLedgerDashboardData,
  type DailyLedgerGroup,
  type LedgerDashboardData,
  type LedgerItem,
  type PaymentMethod,
} from "@/lib/ledger";

const Charts = dynamic(() => import("@/components/AnalysisCharts"), { ssr: false });

type RecordTab = "input" | "history" | "summary" | "trend";
type CalcOperator = "+" | "-" | "*" | "/";

const PAYMENT_METHODS: { key: PaymentMethod; label: string; icon: string }[] = [
  { key: "cash", label: "現金等", icon: "💴" },
  { key: "credit", label: "クレカ", icon: "💳" },
];

const PAYMENT_LABELS: Record<string, string> = {
  cash: "💴現金等",
  credit: "💳クレカ",
};

function parseRecordTab(value: string | null): RecordTab {
  if (value === "history" || value === "daily") return "history";
  if (value === "summary" || value === "trend") return value;
  return "input";
}

function todayString() {
  const today = new Date();
  const year = today.getFullYear();
  const month = String(today.getMonth() + 1).padStart(2, "0");
  const date = String(today.getDate()).padStart(2, "0");
  return `${year}-${month}-${date}`;
}

function dateInRange(date: string, start: string, end: string) {
  return date >= start && date <= end;
}

export default function RecordPage() {
  const [period, setPeriod] = useState(getCurrentPeriod());
  const [activeTab, setActiveTab] = useState<RecordTab>("input");
  const [ledger, setLedger] = useState<LedgerDashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedDate, setSelectedDate] = useState("");
  const selectedDateRef = useRef("");
  const autoScrolledPeriodRef = useRef("");
  const [expandedDates, setExpandedDates] = useState<string[]>([]);
  const [entryOpen, setEntryOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<LedgerItem | null>(null);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [filter, setFilter] = useState<{ category: string; payment: string }>({ category: "", payment: "" });

  const [category, setCategory] = useState("");
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("cash");
  const [date, setDate] = useState(todayString());
  const [memo, setMemo] = useState("");

  const [display, setDisplay] = useState("0");
  const [expression, setExpression] = useState<string | null>(null);
  const pendingRef = useRef<number | null>(null);
  const opRef = useRef<CalcOperator | null>(null);
  const freshRef = useRef(false);

  const amount = display === "0" ? "" : display;

  const showToast = (message: string) => {
    setToast(message);
    setTimeout(() => setToast(null), 2600);
  };

  useEffect(() => {
    selectedDateRef.current = selectedDate;
  }, [selectedDate]);

  const loadData = useCallback(async () => {
    setLoading(true);
    const data = await getLedgerDashboardData(period);
    setLedger(data);

    const params = new URLSearchParams(window.location.search);
    const requestedDate = params.get("date");
    const currentSelectedDate = selectedDateRef.current;
    const nextSelected = requestedDate && dateInRange(requestedDate, data.context.startDate, data.context.endDate)
      ? requestedDate
      : currentSelectedDate && dateInRange(currentSelectedDate, data.context.startDate, data.context.endDate)
        ? currentSelectedDate
        : dateInRange(todayString(), data.context.startDate, data.context.endDate)
          ? todayString()
          : data.context.startDate;

    selectedDateRef.current = nextSelected;
    setSelectedDate(nextSelected);
    const selectedDay = data.dailyGroups.find((day) => day.date === nextSelected);
    const firstSpentDay = data.dailyGroups.find((day) => day.date <= todayString() && day.total > 0);
    const initialExpandedDate = selectedDay?.total ? nextSelected : firstSpentDay?.date || nextSelected;
    setExpandedDates((prev) => (prev.length > 0 ? prev : [initialExpandedDate]));
    setLoading(false);
  }, [period]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    setActiveTab(parseRecordTab(params.get("tab")));
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  const changeTab = useCallback((tab: RecordTab) => {
    setActiveTab(tab);
    const params = new URLSearchParams(window.location.search);
    params.delete("input");
    if (tab === "input") params.delete("tab");
    else params.set("tab", tab);
    const query = params.toString();
    window.history.replaceState(null, "", query ? `/record?${query}` : "/record");
  }, []);

  const navigate = (dir: -1 | 1) => {
    setPeriod(getAdjacentPeriod(period.year, period.month, dir));
    setExpandedDates([]);
  };

  const resetCalc = () => {
    setDisplay("0");
    setExpression(null);
    pendingRef.current = null;
    opRef.current = null;
    freshRef.current = false;
  };

  const setCalcAmount = (value: number) => {
    setDisplay(String(Math.max(0, value)));
    setExpression(null);
    pendingRef.current = null;
    opRef.current = null;
    freshRef.current = true;
  };

  const operatorLabel = (operator: CalcOperator) => {
    if (operator === "*") return "×";
    if (operator === "/") return "÷";
    if (operator === "-") return "−";
    return "+";
  };

  const calculate = (left: number, right: number, operator: CalcOperator) => {
    if (operator === "+") return left + right;
    if (operator === "-") return left - right;
    if (operator === "*") return left * right;
    if (right === 0) {
      showToast("0で割ることはできません");
      return left;
    }
    return Math.floor(left / right);
  };

  const calcPress = (key: string) => {
    if (key === "C") {
      resetCalc();
      return;
    }
    if (key === "back") {
      if (freshRef.current) {
        setDisplay("0");
        freshRef.current = false;
        return;
      }
      setDisplay((d) => (d.length <= 1 ? "0" : d.slice(0, -1)));
      return;
    }
    if (key === "+" || key === "-" || key === "*" || key === "/") {
      const nextOperator = key as CalcOperator;
      const current = parseInt(display) || 0;
      if (pendingRef.current !== null && opRef.current && !freshRef.current) {
        const result = calculate(pendingRef.current, current, opRef.current);
        pendingRef.current = Math.max(0, result);
        opRef.current = nextOperator;
        freshRef.current = true;
        setExpression(`${pendingRef.current.toLocaleString()} ${operatorLabel(nextOperator)}`);
        setDisplay(String(pendingRef.current));
      } else {
        pendingRef.current = current;
        opRef.current = nextOperator;
        freshRef.current = true;
        setExpression(`${current.toLocaleString()} ${operatorLabel(nextOperator)}`);
      }
      return;
    }
    if (key === "=") {
      if (pendingRef.current !== null && opRef.current) {
        const current = parseInt(display) || 0;
        const result = calculate(pendingRef.current, current, opRef.current);
        pendingRef.current = null;
        opRef.current = null;
        freshRef.current = true;
        setExpression(null);
        setDisplay(String(Math.max(0, result)));
      }
      return;
    }

    if (freshRef.current) {
      freshRef.current = false;
      const digit = key === "00" ? "0" : key;
      if (pendingRef.current !== null && opRef.current) {
        setExpression(`${pendingRef.current.toLocaleString()} ${operatorLabel(opRef.current)} ${digit}`);
      }
      setDisplay(digit);
    } else {
      setDisplay((d) => {
        if (d === "0") {
          const v = key === "00" ? "0" : key;
          if (pendingRef.current !== null && opRef.current) {
            setExpression(`${pendingRef.current.toLocaleString()} ${operatorLabel(opRef.current)} ${v}`);
          }
          return v;
        }
        if (d.length >= 8) return d;
        const v = d + key;
        if (pendingRef.current !== null && opRef.current) {
          setExpression(`${pendingRef.current.toLocaleString()} ${operatorLabel(opRef.current)} ${parseInt(v).toLocaleString()}`);
        }
        return v;
      });
    }
  };

  const getDefaultEntryDate = useCallback(() => {
    if (!ledger) return todayString();
    const today = todayString();
    if (dateInRange(today, ledger.context.startDate, ledger.context.endDate)) return today;
    if (selectedDate && dateInRange(selectedDate, ledger.context.startDate, ledger.context.endDate)) return selectedDate;
    return ledger.context.startDate;
  }, [ledger, selectedDate]);

  const openEntrySheet = useCallback((entryDate?: string, item?: LedgerItem) => {
    if (!ledger) return;
    if (ledger.context.isLocked) {
      showToast("確定済み月のため編集できません");
      return;
    }
    if (item && !item.editable) {
      showToast(item.readonlyReason || "編集できません");
      return;
    }

    const lastPayment = typeof window !== "undefined"
      ? localStorage.getItem("lastPaymentMethod")
      : null;
    const initialPayment = item?.paymentMethod || (lastPayment === "credit" ? "credit" : "cash");
    const initialCategory = item?.category || category || ledger.manualCategories[0]?.name || "";
    const initialDate = item?.date || entryDate || getDefaultEntryDate();

    setEditingItem(item || null);
    setCategory(initialCategory);
    setPaymentMethod(initialPayment);
    setDate(initialDate);
    setMemo(item?.memo || "");
    setCalcAmount(item?.amount || 0);
    setEntryOpen(true);
  }, [category, getDefaultEntryDate, ledger]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("input") === "1") {
      setActiveTab("input");
      params.delete("input");
      const query = params.toString();
      window.history.replaceState(null, "", query ? `/record?${query}` : "/record");
    }
  }, []);

  useEffect(() => {
    const handleShowRecordInput = () => changeTab("input");

    window.addEventListener("show-record-input", handleShowRecordInput);
    return () => window.removeEventListener("show-record-input", handleShowRecordInput);
  }, [changeTab]);

  useEffect(() => {
    if (!ledger || editingItem) return;
    if (!category && ledger.manualCategories[0]) {
      setCategory(ledger.manualCategories[0].name);
    }
    if (!dateInRange(date, ledger.context.startDate, ledger.context.endDate)) {
      setDate(getDefaultEntryDate());
    }
  }, [category, date, editingItem, getDefaultEntryDate, ledger]);

  useEffect(() => {
    if (!ledger || activeTab !== "history" || entryOpen || !selectedDate) return;
    const scrollKey = `${ledger.context.period}:${selectedDate}`;
    if (autoScrolledPeriodRef.current === scrollKey) return;
    autoScrolledPeriodRef.current = scrollKey;
    window.setTimeout(() => {
      document.querySelector(`[data-ledger-date="${selectedDate}"]`)?.scrollIntoView({ block: "center" });
    }, 120);
  }, [activeTab, entryOpen, ledger, selectedDate]);

  const closeEntrySheet = () => {
    setEntryOpen(false);
    setEditingItem(null);
    setMemo("");
    resetCalc();
  };

  const saveEntry = async () => {
    if (!ledger || ledger.context.isLocked) {
      showToast("確定済み月のため編集できません");
      return;
    }
    const amountNum = parseInt(amount);
    if (!amountNum || !category || !date) return;

    setSaving(true);
    try {
      if (editingItem) {
        await supabase.from("personal_expenses").update({
          amount: amountNum,
          category,
          payment_method: paymentMethod,
          memo: memo.trim() || null,
          expense_date: date,
          updated_at: new Date().toISOString(),
        }).eq("id", editingItem.sourceId);
      } else {
        await supabase.from("personal_expenses").insert({
          amount: amountNum,
          category,
          payment_method: paymentMethod,
          memo: memo.trim() || null,
          expense_date: date,
        });
      }

      localStorage.setItem("lastPaymentMethod", paymentMethod);
      selectedDateRef.current = date;
      setSelectedDate(date);
      setExpandedDates((prev) => (prev.includes(date) ? prev : [...prev, date]));
      closeEntrySheet();
      showToast(`¥${amountNum.toLocaleString()} ${editingItem ? "更新しました" : "記録しました"}`);
      await loadData();
    } finally {
      setSaving(false);
    }
  };

  const deleteItem = async (item: LedgerItem) => {
    if (!item.deleteable) {
      showToast(item.readonlyReason || "削除できません");
      return;
    }
    if (!window.confirm("この支出記録を削除しますか？")) return;
    await supabase.from("personal_expenses").delete().eq("id", item.sourceId);
    showToast("削除しました");
    await loadData();
  };

  const toggleDate = (dateValue: string) => {
    selectedDateRef.current = dateValue;
    setSelectedDate(dateValue);
    setExpandedDates((prev) => (
      prev.includes(dateValue)
        ? prev.filter((d) => d !== dateValue)
        : [...prev, dateValue]
    ));
  };

  const filteredTrendItems = useMemo(() => {
    if (!ledger) return [];
    return ledger.items.filter((item) => {
      if (filter.category && item.category !== filter.category) return false;
      if (filter.payment) {
        if (item.source !== "manual") return false;
        if (item.paymentMethod !== filter.payment) return false;
      }
      return true;
    });
  }, [filter, ledger]);

  const historyGroups = useMemo(() => {
    if (!ledger) return [];
    const today = todayString();
    if (dateInRange(today, ledger.context.startDate, ledger.context.endDate)) {
      return ledger.dailyGroups.filter((day) => day.date <= today);
    }
    return ledger.dailyGroups;
  }, [ledger]);

  if (loading || !ledger) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2" style={{ borderColor: "var(--accent)" }} />
      </div>
    );
  }

  const totalDays = ledger.dailyGroups.length || 1;
  const dailyAverage = Math.floor(ledger.totalSpent / totalDays);

  const showCompactSummary = activeTab !== "input";

  return (
    <div className="space-y-2 pb-28 overflow-x-hidden">
      <div className="flex items-center justify-between px-1">
        <button onClick={() => navigate(-1)} className="text-xl px-3 py-1" style={{ color: "var(--warm-gray-400)" }}>‹</button>
        <h1 className="text-sm font-bold tracking-wide" style={{ color: "var(--ink)" }}>{ledger.context.label}</h1>
        <button onClick={() => navigate(1)} className="text-xl px-3 py-1" style={{ color: "var(--warm-gray-400)" }}>›</button>
      </div>

      {ledger.context.isLocked && (
        <div className="text-xs rounded px-3 py-2 text-center" style={{ backgroundColor: "var(--warm-gray-100)", color: "var(--warm-gray-600)" }}>
          確定済み月のため、手入力支出の追加・編集・削除はできません
        </div>
      )}

      {showCompactSummary && (
        <section className="-mx-5 px-5 py-3" style={{ backgroundColor: "var(--bg-card)", borderTop: "1px solid var(--border)", borderBottom: "1px solid var(--border)" }}>
          <div className="grid grid-cols-3 gap-2 items-baseline">
            <p className="text-xs font-medium" style={{ color: "var(--warm-gray-500)" }}>
              支出合計 <span className="font-amount text-lg font-bold" style={{ color: "var(--ink)" }}>¥{ledger.totalSpent.toLocaleString()}</span>
            </p>
            <p className="text-xs font-medium text-center" style={{ color: "var(--warm-gray-500)" }}>
              日平均 <span className="font-amount font-bold" style={{ color: "var(--accent)" }}>¥{dailyAverage.toLocaleString()}</span>
            </p>
            <p className="text-xs font-medium text-right" style={{ color: "var(--warm-gray-500)" }}>
              <span className="font-amount font-bold" style={{ color: "var(--ink)" }}>{ledger.itemCount}</span>件
            </p>
          </div>
        </section>
      )}

      <div className="-mx-5 grid grid-cols-4 gap-1 px-5 py-1.5" style={{ backgroundColor: "var(--bg-card)", borderBottom: "1px solid var(--border)" }}>
        {([
          ["input", "入力"],
          ["history", "履歴"],
          ["summary", "集計"],
          ["trend", "推移"],
        ] as [RecordTab, string][]).map(([tab, label]) => (
          <button
            key={tab}
            onClick={() => changeTab(tab)}
            className="py-2 rounded-lg text-sm font-bold transition-colors outline-none"
            style={{
              backgroundColor: activeTab === tab ? "var(--bg-card)" : "transparent",
              color: activeTab === tab ? "var(--accent)" : "var(--warm-gray-500)",
              boxShadow: activeTab === tab ? "0 1px 8px rgba(26,26,26,0.08)" : "none",
              border: activeTab === tab ? "1px solid var(--border)" : "1px solid transparent",
            }}
          >
            {label}
          </button>
        ))}
      </div>

      {activeTab === "input" && (
        <RecordInputTab
          amount={amount}
          category={category}
          date={date}
          expression={expression}
          memo={memo}
          paymentMethod={paymentMethod}
          categories={ledger.manualCategories}
          saving={saving}
          isLocked={ledger.context.isLocked}
          onCalcPress={calcPress}
          onCategoryChange={setCategory}
          onDateChange={setDate}
          onMemoChange={setMemo}
          onPaymentChange={setPaymentMethod}
          onSave={saveEntry}
        />
      )}

      {activeTab === "history" && (
        <DailyTab
          groups={historyGroups}
          selectedDate={selectedDate}
          expandedDates={expandedDates}
          onToggleDate={toggleDate}
          onEdit={openEntrySheet}
          onDelete={deleteItem}
        />
      )}

      {activeTab === "summary" && (
        <SummaryTab
          categorySummary={ledger.categorySummary}
          periodLabel={ledger.context.label}
          monthlyTrend={ledger.monthlyTrend}
          totalSpent={ledger.totalSpent}
        />
      )}

      {activeTab === "trend" && (
        <TrendTab
          ledger={ledger}
          filteredItems={filteredTrendItems}
          filter={filter}
          onFilterChange={setFilter}
        />
      )}

      {activeTab !== "input" && (
        <button
          type="button"
          onClick={() => changeTab("input")}
          disabled={ledger.context.isLocked}
          className="fixed right-5 z-40 px-5 py-3 rounded-full text-sm font-bold shadow-lg active:scale-[0.98] disabled:opacity-50"
          style={{ bottom: "82px", backgroundColor: "var(--accent)", color: "#FFFFFF" }}
        >
          ＋入力
        </button>
      )}

      {entryOpen && (
        <EntrySheet
          amount={amount}
          category={category}
          date={date}
          expression={expression}
          memo={memo}
          paymentMethod={paymentMethod}
          categories={ledger.manualCategories}
          saving={saving}
          editing={Boolean(editingItem)}
          onCalcPress={calcPress}
          onCategoryChange={setCategory}
          onClose={closeEntrySheet}
          onDateChange={setDate}
          onMemoChange={setMemo}
          onPaymentChange={setPaymentMethod}
          onSave={saveEntry}
        />
      )}

      {toast && (
        <div className="fixed top-4 left-1/2 toast-slide-in z-50 text-sm font-medium px-6 py-3 rounded-lg"
          style={{ backgroundColor: "var(--ink)", color: "#FFFFFF", boxShadow: "0 4px 20px rgba(0,0,0,0.15)" }}>
          {toast}
        </div>
      )}
    </div>
  );
}

function RecordInputTab(props: {
  amount: string;
  category: string;
  date: string;
  expression: string | null;
  memo: string;
  paymentMethod: PaymentMethod;
  categories: LedgerDashboardData["manualCategories"];
  saving: boolean;
  isLocked: boolean;
  onCalcPress: (key: string) => void;
  onCategoryChange: (category: string) => void;
  onDateChange: (date: string) => void;
  onMemoChange: (memo: string) => void;
  onPaymentChange: (payment: PaymentMethod) => void;
  onSave: () => void;
}) {
  return (
    <section className="space-y-3">
      {props.isLocked ? (
        <p className="text-xs rounded px-3 py-2 text-center" style={{ backgroundColor: "var(--warm-gray-100)", color: "var(--warm-gray-600)" }}>
          確定済み月のため、手入力支出は追加できません
        </p>
      ) : (
        <EntryFormContent {...props} editing={false} stickySave stickySaveOffset="70px" />
      )}
    </section>
  );
}

function DailyTab({
  groups,
  selectedDate,
  expandedDates,
  onToggleDate,
  onEdit,
  onDelete,
}: {
  groups: DailyLedgerGroup[];
  selectedDate: string;
  expandedDates: string[];
  onToggleDate: (date: string) => void;
  onEdit: (date?: string, item?: LedgerItem) => void;
  onDelete: (item: LedgerItem) => void;
}) {
  return (
    <div className="-mx-5">
      {groups.map((day) => {
        const expanded = expandedDates.includes(day.date);
        const isSelected = selectedDate === day.date;
        const dayItems = day.categories.flatMap((group) => group.items);
        const icons = day.categories.slice(0, 4);
        return (
          <section
            key={day.date}
            data-ledger-date={day.date}
            className="scroll-mt-24"
            style={{
              backgroundColor: expanded ? "var(--accent-light)" : "var(--bg-card)",
              borderTop: "1px solid var(--border)",
              opacity: day.total === 0 ? 0.58 : 1,
            }}
          >
            <button
              type="button"
              onClick={() => onToggleDate(day.date)}
              className="w-full flex items-center justify-between px-5 py-3 text-left"
              style={{ borderLeft: isSelected ? "3px solid var(--accent)" : "3px solid transparent" }}
            >
              <div className="min-w-0">
                <p className="text-base font-bold leading-tight" style={{ color: day.total > 0 ? "var(--ink)" : "var(--warm-gray-400)" }}>{formatDateLabel(day.date)}</p>
                <div className="mt-1 flex items-center gap-1.5">
                  <span className="text-[10px]" style={{ color: "var(--warm-gray-500)" }}>{day.count > 0 ? `${day.count}件` : "記録なし"}</span>
                  {icons.map((group) => (
                    <span key={`${day.date}-${group.category}`} className="grid h-6 w-6 place-items-center rounded" style={{ backgroundColor: "var(--warm-gray-50)" }}>
                      <span className="text-xs">{group.icon || "📦"}</span>
                    </span>
                  ))}
                </div>
              </div>
              <div className="text-right shrink-0">
                <p className="font-amount text-base font-extrabold" style={{ color: day.total > 0 ? "var(--ink)" : "var(--warm-gray-300)" }}>
                  ¥{day.total.toLocaleString()}
                </p>
                <span className="text-sm" style={{ color: day.total > 0 ? "var(--accent)" : "var(--warm-gray-300)" }}>{expanded ? "⌃" : "⌄"}</span>
              </div>
            </button>

            {expanded && (
              <div style={{ backgroundColor: "var(--bg-card)", borderTop: "1px solid var(--border)" }}>
                {dayItems.length === 0 ? (
                  <p className="text-sm text-center py-5" style={{ color: "var(--warm-gray-300)" }}>この日の支出はありません</p>
                ) : dayItems.map((item) => (
                  <LedgerItemRow
                    key={item.id}
                    item={item}
                    onEdit={() => onEdit(day.date, item)}
                    onDelete={() => onDelete(item)}
                  />
                ))}
              </div>
            )}
          </section>
        );
      })}
    </div>
  );
}

function LedgerItemRow({ item, onEdit, onDelete }: { item: LedgerItem; onEdit: () => void; onDelete: () => void }) {
  const isManual = item.source === "manual";
  const paymentLabel = isManual ? (item.paymentMethod ? PAYMENT_LABELS[item.paymentMethod] : "手入力") : "ワリカン同期";
  return (
    <div className="flex min-h-[60px] items-stretch" style={{ borderTop: "1px solid var(--border)" }}>
      <div className="flex min-w-0 flex-1 items-center gap-3 px-5 py-2.5">
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg" style={{ backgroundColor: "var(--warm-gray-50)" }}>
          {item.categoryIcon || "📦"}
        </span>
        <div className="min-w-0">
          <p className="truncate text-sm font-bold" style={{ color: "var(--ink)" }}>{item.memo || item.category}</p>
          <p className="truncate text-[11px]" style={{ color: "var(--warm-gray-400)" }}>
            {item.category} ・ {paymentLabel}
          </p>
          {item.readonlyReason && <p className="truncate text-[10px]" style={{ color: "var(--warm-gray-400)" }}>{item.readonlyReason}</p>}
        </div>
      </div>
      <div className="flex shrink-0 items-stretch">
        <div className="flex w-[68px] items-center justify-end px-2">
          <p className="font-amount text-sm font-bold" style={{ color: "var(--ink)" }}>¥{item.amount.toLocaleString()}</p>
        </div>
        {isManual && (
          <>
            <button
              type="button"
              onClick={onEdit}
              disabled={!item.editable}
              aria-label="編集"
              className="grid w-10 place-items-center text-base font-bold disabled:opacity-40"
              style={{ backgroundColor: "var(--accent)", color: "#FFFFFF" }}
            >
              ✎
            </button>
            <button
              type="button"
              onClick={onDelete}
              disabled={!item.deleteable}
              aria-label="削除"
              className="grid w-10 place-items-center text-base font-bold disabled:opacity-40"
              style={{ backgroundColor: "var(--error)", color: "#FFFFFF" }}
            >
              ×
            </button>
          </>
        )}
      </div>
    </div>
  );
}

function SummaryTab({
  categorySummary,
  monthlyTrend,
  periodLabel,
  totalSpent,
}: {
  categorySummary: LedgerDashboardData["categorySummary"];
  monthlyTrend: LedgerDashboardData["monthlyTrend"];
  periodLabel: string;
  totalSpent: number;
}) {
  return (
    <div className="space-y-5">
      <Charts
        catBreakdown={categorySummary}
        totalSpent={totalSpent}
        monthlyTrend={monthlyTrend}
        showTrend={false}
      />

      <AiCommentCard
        categorySummary={categorySummary}
        monthlyTrend={monthlyTrend}
        periodLabel={periodLabel}
        totalSpent={totalSpent}
      />

      <section className="card p-5">
        <h2 className="text-xs font-light tracking-widest mb-4" style={{ color: "var(--warm-gray-400)" }}>前月比較</h2>
        {categorySummary.length === 0 ? (
          <p className="text-sm text-center py-4" style={{ color: "var(--warm-gray-300)" }}>データなし</p>
        ) : (
          <div className="space-y-4">
            {categorySummary.map((cat) => {
              const diff = cat.spent - cat.prevSpent;
              return (
                <div key={cat.name}>
                  <div className="flex justify-between items-baseline">
                    <span className="text-sm" style={{ color: "var(--warm-gray-600)" }}>{cat.icon} {cat.name}</span>
                    <span className="font-amount text-base font-bold" style={{ color: "var(--ink)" }}>¥{cat.spent.toLocaleString()}</span>
                  </div>
                  <p className="text-xs mt-0.5" style={{ color: "var(--warm-gray-400)" }}>
                    先月: ¥{cat.prevSpent.toLocaleString()} / 先月比{" "}
                    <span style={{ color: diff > 0 ? "var(--error)" : diff < 0 ? "var(--accent)" : "var(--warm-gray-400)" }}>
                      {diff > 0 ? `+¥${diff.toLocaleString()}` : diff < 0 ? `-¥${Math.abs(diff).toLocaleString()}` : "±0"}
                    </span>
                  </p>
                </div>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}

function AiCommentCard({
  categorySummary,
  monthlyTrend,
  periodLabel,
  totalSpent,
}: {
  categorySummary: LedgerDashboardData["categorySummary"];
  monthlyTrend: LedgerDashboardData["monthlyTrend"];
  periodLabel: string;
  totalSpent: number;
}) {
  const [comment, setComment] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setComment(null);
  }, [periodLabel]);

  const fetchComment = async () => {
    setLoading(true);
    setComment(null);
    try {
      const res = await fetch("/api/ai-comment", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          period: periodLabel,
          totalSpent,
          catBreakdown: categorySummary.map((cat) => ({
            name: cat.name,
            icon: cat.icon,
            spent: cat.spent,
            prevSpent: cat.prevSpent,
            budget: cat.budget,
          })),
          monthlyTrend,
        }),
      });
      const data = await res.json();
      setComment(data.comment || (res.ok ? "コメントを取得できませんでした。" : "エラーが発生しました。"));
    } catch {
      setComment("エラーが発生しました。もう一度お試しください。");
    } finally {
      setLoading(false);
    }
  };

  return (
    <section className="rounded-lg overflow-hidden" style={{ backgroundColor: "var(--cream)", border: "1px solid var(--cream-accent)" }}>
      <div className="flex">
        <div className="w-1 shrink-0" style={{ backgroundColor: "var(--accent)" }} />
        <div className="flex-1 p-5">
          <div className="flex items-center gap-2 mb-3">
            <span className="text-2xl">🐥</span>
            <div>
              <h2 className="text-sm font-medium" style={{ color: "var(--ink)" }}>マネ吉のひとこと</h2>
              <p className="text-[10px] font-light" style={{ color: "var(--warm-gray-500)" }}>AIファイナンシャルパートナー</p>
            </div>
          </div>

          {comment ? (
            <>
              <div className="rounded p-3 text-sm leading-relaxed whitespace-pre-wrap" style={{ backgroundColor: "var(--bg-card)", color: "var(--ink-light)" }}>
                {comment}
              </div>
              <button
                type="button"
                onClick={fetchComment}
                disabled={loading}
                className="mt-3 w-full py-2 rounded text-xs font-light transition-colors disabled:opacity-50"
                style={{ backgroundColor: "var(--cream-accent)", color: "var(--ink-light)" }}
              >
                {loading ? "分析中..." : "もう一度聞く"}
              </button>
            </>
          ) : (
            <button
              type="button"
              onClick={fetchComment}
              disabled={loading}
              className="w-full py-3 rounded text-sm font-medium transition-all disabled:opacity-50"
              style={{ backgroundColor: "var(--cream-accent)", color: "var(--ink-light)" }}
            >
              {loading ? "分析中..." : "マネ吉に聞いてみる"}
            </button>
          )}
        </div>
      </div>
    </section>
  );
}

function TrendTab({
  ledger,
  filteredItems,
  filter,
  onFilterChange,
}: {
  ledger: LedgerDashboardData;
  filteredItems: LedgerItem[];
  filter: { category: string; payment: string };
  onFilterChange: (filter: { category: string; payment: string }) => void;
}) {
  return (
    <div className="space-y-5">
      <Charts
        catBreakdown={ledger.categorySummary}
        totalSpent={ledger.totalSpent}
        monthlyTrend={ledger.monthlyTrend}
        showPie={false}
      />

      <section className="card p-5">
        <h2 className="text-xs font-light tracking-widest mb-4" style={{ color: "var(--warm-gray-400)" }}>支出一覧</h2>
        <div className="flex gap-2 overflow-x-auto pb-2 mb-3">
          <button
            onClick={() => onFilterChange({ ...filter, category: "" })}
            className="text-xs px-3 py-1.5 rounded-full whitespace-nowrap"
            style={{
              backgroundColor: !filter.category ? "var(--accent)" : "var(--warm-gray-50)",
              color: !filter.category ? "#FFFFFF" : "var(--warm-gray-600)",
            }}
          >
            全て
          </button>
          {ledger.categorySummary.map((cat) => (
            <button
              key={cat.name}
              onClick={() => onFilterChange({ ...filter, category: cat.name })}
              className="text-xs px-3 py-1.5 rounded-full whitespace-nowrap"
              style={{
                backgroundColor: filter.category === cat.name ? "var(--accent)" : "var(--warm-gray-50)",
                color: filter.category === cat.name ? "#FFFFFF" : "var(--warm-gray-600)",
              }}
            >
              {cat.icon}{cat.name}
            </button>
          ))}
        </div>
        <div className="flex gap-2 overflow-x-auto pb-2 mb-3">
          <button
            onClick={() => onFilterChange({ ...filter, payment: "" })}
            className="text-xs px-3 py-1.5 rounded-full whitespace-nowrap"
            style={{ backgroundColor: !filter.payment ? "var(--accent-light)" : "var(--warm-gray-50)", color: "var(--accent-dark)" }}
          >
            支払い全て
          </button>
          {PAYMENT_METHODS.map((pm) => (
            <button
              key={pm.key}
              onClick={() => onFilterChange({ ...filter, payment: pm.key })}
              className="text-xs px-3 py-1.5 rounded-full whitespace-nowrap"
              style={{
                backgroundColor: filter.payment === pm.key ? "var(--accent-light)" : "var(--warm-gray-50)",
                color: filter.payment === pm.key ? "var(--accent-dark)" : "var(--warm-gray-600)",
              }}
            >
              {pm.icon}{pm.label}
            </button>
          ))}
        </div>

        {filteredItems.length === 0 ? (
          <p className="text-sm text-center py-5" style={{ color: "var(--warm-gray-300)" }}>該当する支出なし</p>
        ) : (
          <div className="space-y-1">
            {filteredItems.map((item) => (
              <div key={item.id} className="flex items-center justify-between py-2.5">
                <div className="min-w-0">
                  <p className="text-sm truncate" style={{ color: "var(--ink-light)" }}>
                    {item.categoryIcon || "📦"} {item.memo || item.category}
                  </p>
                  <p className="text-xs" style={{ color: "var(--warm-gray-400)" }}>
                    {item.date} / {item.source === "manual" ? (item.paymentMethod ? PAYMENT_LABELS[item.paymentMethod] : "手入力") : "ワリカン同期"}
                  </p>
                </div>
                <span className="font-amount text-sm font-semibold shrink-0" style={{ color: "var(--ink)" }}>-¥{item.amount.toLocaleString()}</span>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function EntryFormContent({
  amount,
  category,
  date,
  expression,
  memo,
  paymentMethod,
  categories,
  saving,
  editing,
  stickySave,
  stickySaveOffset,
  onCalcPress,
  onCategoryChange,
  onDateChange,
  onMemoChange,
  onPaymentChange,
  onSave,
}: {
  amount: string;
  category: string;
  date: string;
  expression: string | null;
  memo: string;
  paymentMethod: PaymentMethod;
  categories: LedgerDashboardData["manualCategories"];
  saving: boolean;
  editing: boolean;
  stickySave: boolean;
  stickySaveOffset?: string;
  onCalcPress: (key: string) => void;
  onCategoryChange: (category: string) => void;
  onDateChange: (date: string) => void;
  onMemoChange: (memo: string) => void;
  onPaymentChange: (payment: PaymentMethod) => void;
  onSave: () => void;
}) {
  const calcKeys = [
    { k: "7", l: "7", s: "n" }, { k: "8", l: "8", s: "n" }, { k: "9", l: "9", s: "n" }, { k: "/", l: "÷", s: "o" },
    { k: "4", l: "4", s: "n" }, { k: "5", l: "5", s: "n" }, { k: "6", l: "6", s: "n" }, { k: "*", l: "×", s: "o" },
    { k: "1", l: "1", s: "n" }, { k: "2", l: "2", s: "n" }, { k: "3", l: "3", s: "n" }, { k: "-", l: "−", s: "o" },
    { k: "C", l: "C", s: "c" }, { k: "0", l: "0", s: "n" }, { k: "00", l: "00", s: "n" }, { k: "+", l: "+", s: "o" },
    { k: "back", l: "⌫", s: "f" }, { k: "=", l: "=", s: "e", span: 3 },
  ];

  const selectedCategory = categories.find((cat) => cat.name === category);

  const saveButton = (
    <button
      type="button"
      onClick={onSave}
      disabled={saving || !amount || !category}
      className="w-full py-3.5 text-base font-bold disabled:opacity-40 active:scale-[0.98]"
      style={{ borderRadius: "10px", backgroundColor: "var(--accent)", color: "#FFFFFF" }}
    >
      {saving ? "保存中..." : editing ? "✓ 更新する" : "✓ 記録する"}
    </button>
  );

  return (
    <>
      <div className="space-y-2">
        <div className="flex items-center justify-between gap-3">
          <div className="flex shrink-0 rounded-lg p-1" style={{ backgroundColor: "var(--warm-gray-100)" }}>
            <button
              type="button"
              className="rounded-md px-3 py-1 text-xs font-bold"
              style={{ backgroundColor: "var(--accent)", color: "#FFFFFF" }}
            >
              支出
            </button>
            <button
              type="button"
              disabled
              className="rounded-md px-3 py-1 text-xs font-bold disabled:opacity-50"
              style={{ color: "var(--warm-gray-500)" }}
            >
              収入
            </button>
          </div>
          {selectedCategory && (
            <div className="min-w-0 text-right">
              <p className="truncate text-xs font-bold" style={{ color: "var(--accent)" }}>
                {selectedCategory.icon} {selectedCategory.name}
              </p>
              {expression && <p className="font-amount text-xs" style={{ color: "var(--warm-gray-400)" }}>{expression}</p>}
            </div>
          )}
        </div>

        <div className="flex items-end justify-end gap-2 border-b pb-1.5" style={{ borderColor: "var(--border)" }}>
          <span className="font-amount text-xl font-bold" style={{ color: "var(--warm-gray-300)" }}>¥</span>
          <div
            className="min-w-0 font-amount font-extrabold leading-none text-right select-none"
            style={{ fontSize: "36px", color: amount ? "var(--ink)" : "var(--warm-gray-300)" }}
            aria-live="polite"
          >
            {amount ? parseInt(amount).toLocaleString() : "0"}
          </div>
        </div>
      </div>

      <div>
        <div className="mb-1 flex items-center justify-between">
          <label className="text-xs font-bold tracking-wide" style={{ color: "var(--warm-gray-400)" }}>カテゴリ</label>
          <span className="text-[10px]" style={{ color: "var(--warm-gray-300)" }}>横にスライド</span>
        </div>
        <div className="flex gap-2 overflow-x-auto pb-1">
          {categories.map((cat) => (
            <button
              key={cat.id}
              type="button"
              onClick={() => onCategoryChange(cat.name)}
              className="h-[42px] shrink-0 rounded-lg px-3 text-center text-[11px] font-bold leading-tight"
              style={{
                backgroundColor: category === cat.name ? "var(--accent-light)" : "var(--bg-card)",
                color: category === cat.name ? "var(--accent-dark)" : "var(--warm-gray-600)",
                border: category === cat.name ? "1px solid var(--accent)" : "1px solid var(--border)",
              }}
            >
              <span className="mr-1 text-base leading-none">{cat.icon}</span>
              {cat.name}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-[1.2fr_0.9fr_1fr] gap-2">
        <input
          type="date"
          value={date}
          onChange={(e) => onDateChange(e.target.value)}
          aria-label="日付"
          className="w-full rounded-lg px-2 py-2 outline-none"
          style={{ fontSize: "16px", border: "1px solid var(--border)", color: "var(--ink)", backgroundColor: "var(--bg-card)" }}
        />
        <button
          type="button"
          onClick={() => onPaymentChange(paymentMethod === "cash" ? "credit" : "cash")}
          className="rounded-lg px-2 py-2 text-xs font-bold"
          style={{ backgroundColor: "var(--accent-light)", color: "var(--accent-dark)", border: "1px solid var(--accent-muted)" }}
        >
          {PAYMENT_METHODS.find((pm) => pm.key === paymentMethod)?.icon} {PAYMENT_METHODS.find((pm) => pm.key === paymentMethod)?.label}
        </button>
        <input
          type="text"
          value={memo}
          onChange={(e) => onMemoChange(e.target.value)}
          placeholder="メモ"
          aria-label="メモ"
          className="w-full rounded-lg px-3 py-2 outline-none"
          style={{ fontSize: "16px", border: "1px solid var(--border)", color: "var(--ink)", backgroundColor: "var(--bg-card)" }}
        />
      </div>

      <div className="grid grid-cols-4 gap-1">
        {calcKeys.map(({ k, l, s, span }) => (
          <button
            key={k}
            type="button"
            onClick={() => onCalcPress(k)}
            className={`font-amount font-bold select-none active:scale-[0.97] ${span === 3 ? "col-span-3" : ""}`}
            style={{
              height: "clamp(36px, 5dvh, 40px)",
              borderRadius: "8px",
              fontSize: "18px",
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

      {stickySave ? (
        <div
          className={stickySaveOffset ? "px-5 pt-1.5" : "-mx-4 px-4 pt-1.5"}
          style={{
            position: stickySaveOffset ? "fixed" : "sticky",
            bottom: stickySaveOffset || "0px",
            left: stickySaveOffset ? "50%" : undefined,
            transform: stickySaveOffset ? "translateX(-50%)" : undefined,
            width: stickySaveOffset ? "min(100vw, 512px)" : undefined,
            zIndex: stickySaveOffset ? 60 : undefined,
            boxSizing: "border-box",
            backgroundColor: "var(--bg)",
            paddingBottom: "calc(10px + env(safe-area-inset-bottom))",
          }}
        >
          {saveButton}
        </div>
      ) : saveButton}
    </>
  );
}

function EntrySheet({
  amount,
  category,
  date,
  expression,
  memo,
  paymentMethod,
  categories,
  saving,
  editing,
  onCalcPress,
  onCategoryChange,
  onClose,
  onDateChange,
  onMemoChange,
  onPaymentChange,
  onSave,
}: {
  amount: string;
  category: string;
  date: string;
  expression: string | null;
  memo: string;
  paymentMethod: PaymentMethod;
  categories: LedgerDashboardData["manualCategories"];
  saving: boolean;
  editing: boolean;
  onCalcPress: (key: string) => void;
  onCategoryChange: (category: string) => void;
  onClose: () => void;
  onDateChange: (date: string) => void;
  onMemoChange: (memo: string) => void;
  onPaymentChange: (payment: PaymentMethod) => void;
  onSave: () => void;
}) {
  return (
    <div className="fixed inset-0 bg-black/40 z-[80] flex items-end justify-center" onClick={onClose}>
      <div
        className="w-full max-w-lg max-h-[calc(100dvh-10px)] overflow-y-auto rounded-t-[22px] px-4 pb-0 pt-3 space-y-3"
        style={{ backgroundColor: "var(--bg)", border: "1px solid var(--border)", borderBottom: "none" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mx-auto h-1 w-10 rounded-full" style={{ backgroundColor: "var(--warm-gray-200)" }} />
        <div className="flex items-center justify-between">
          <h2 className="text-base font-bold" style={{ color: "var(--ink)" }}>{editing ? "支出を編集" : "支出を入力"}</h2>
          <button onClick={onClose} className="text-sm px-2 py-1" style={{ color: "var(--warm-gray-400)" }}>閉じる</button>
        </div>

        <EntryFormContent
          amount={amount}
          category={category}
          date={date}
          expression={expression}
          memo={memo}
          paymentMethod={paymentMethod}
          categories={categories}
          saving={saving}
          editing={editing}
          stickySave
          onCalcPress={onCalcPress}
          onCategoryChange={onCategoryChange}
          onDateChange={onDateChange}
          onMemoChange={onMemoChange}
          onPaymentChange={onPaymentChange}
          onSave={onSave}
        />
      </div>
    </div>
  );
}
