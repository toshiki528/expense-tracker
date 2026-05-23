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

type RecordTab = "daily" | "summary" | "trend";

const PAYMENT_METHODS: { key: PaymentMethod; label: string; icon: string }[] = [
  { key: "cash", label: "現金等", icon: "💴" },
  { key: "credit", label: "クレカ", icon: "💳" },
];

const PAYMENT_LABELS: Record<string, string> = {
  cash: "💴現金等",
  credit: "💳クレカ",
};

function isRecordTab(value: string | null): value is RecordTab {
  return value === "daily" || value === "summary" || value === "trend";
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
  const [activeTab, setActiveTab] = useState<RecordTab>("daily");
  const [ledger, setLedger] = useState<LedgerDashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedDate, setSelectedDate] = useState("");
  const selectedDateRef = useRef("");
  const pendingOpenInputRef = useRef(false);
  const autoScrolledPeriodRef = useRef("");
  const [expandedDates, setExpandedDates] = useState<string[]>([]);
  const [expandedCategories, setExpandedCategories] = useState<string[]>([]);
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
  const opRef = useRef<string | null>(null);
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
    setExpandedDates((prev) => (prev.length > 0 ? prev : [nextSelected]));
    setLoading(false);
  }, [period]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const tab = params.get("tab");
    if (isRecordTab(tab)) setActiveTab(tab);
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  const changeTab = (tab: RecordTab) => {
    setActiveTab(tab);
    const params = new URLSearchParams(window.location.search);
    if (tab === "daily") params.delete("tab");
    else params.set("tab", tab);
    const query = params.toString();
    window.history.replaceState(null, "", query ? `/record?${query}` : "/record");
  };

  const navigate = (dir: -1 | 1) => {
    setPeriod(getAdjacentPeriod(period.year, period.month, dir));
    setExpandedDates([]);
    setExpandedCategories([]);
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

  const calcPress = (key: string) => {
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
        const result = opRef.current === "+" ? pendingRef.current + current : pendingRef.current - current;
        pendingRef.current = Math.max(0, result);
        opRef.current = key;
        freshRef.current = true;
        const sym = key === "+" ? "+" : "−";
        setExpression(`${pendingRef.current.toLocaleString()} ${sym}`);
        setDisplay(String(pendingRef.current));
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
        const result = opRef.current === "+" ? pendingRef.current + current : pendingRef.current - current;
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

  const getDefaultEntryDate = useCallback(() => {
    if (!ledger) return todayString();
    const today = todayString();
    if (dateInRange(today, ledger.context.startDate, ledger.context.endDate)) return today;
    if (selectedDate && dateInRange(selectedDate, ledger.context.startDate, ledger.context.endDate)) return selectedDate;
    return ledger.context.startDate;
  }, [ledger, selectedDate]);

  const openEntrySheet = useCallback((entryDate?: string, item?: LedgerItem) => {
    if (!ledger) {
      pendingOpenInputRef.current = true;
      return;
    }
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
    if (!ledger) return;
    const openRequestedInput = () => {
      pendingOpenInputRef.current = false;
      openEntrySheet();
    };

    const params = new URLSearchParams(window.location.search);
    if (params.get("input") === "1") {
      openRequestedInput();
      params.delete("input");
      const query = params.toString();
      window.history.replaceState(null, "", query ? `/record?${query}` : "/record");
      return;
    }

    if (pendingOpenInputRef.current) openRequestedInput();
  }, [ledger, openEntrySheet]);

  useEffect(() => {
    const handleOpenRecordEntry = () => {
      if (!ledger) {
        pendingOpenInputRef.current = true;
        return;
      }
      openEntrySheet();
    };

    window.addEventListener("open-record-entry", handleOpenRecordEntry);
    return () => window.removeEventListener("open-record-entry", handleOpenRecordEntry);
  }, [ledger, openEntrySheet]);

  useEffect(() => {
    if (!ledger || activeTab !== "daily" || entryOpen || !selectedDate) return;
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

  const toggleCategory = (key: string) => {
    setExpandedCategories((prev) => (
      prev.includes(key)
        ? prev.filter((value) => value !== key)
        : [...prev, key]
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

  if (loading || !ledger) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2" style={{ borderColor: "var(--accent)" }} />
      </div>
    );
  }

  const totalDays = ledger.dailyGroups.length || 1;
  const dailyAverage = Math.floor(ledger.totalSpent / totalDays);

  return (
    <div className="space-y-5 pb-28 overflow-x-hidden">
      <div className="flex items-center justify-between px-2">
        <button onClick={() => navigate(-1)} className="text-xl px-3 py-1" style={{ color: "var(--warm-gray-400)" }}>‹</button>
        <h1 className="text-sm font-medium tracking-wide" style={{ color: "var(--ink)" }}>{ledger.context.label}</h1>
        <button onClick={() => navigate(1)} className="text-xl px-3 py-1" style={{ color: "var(--warm-gray-400)" }}>›</button>
      </div>

      {ledger.context.isLocked && (
        <div className="text-xs rounded px-3 py-2 text-center" style={{ backgroundColor: "var(--warm-gray-100)", color: "var(--warm-gray-600)" }}>
          確定済み月のため、手入力支出の追加・編集・削除はできません
        </div>
      )}

      <section className="card p-5">
        <div className="grid grid-cols-3 gap-3 text-center">
          <div>
            <p className="text-[10px] tracking-wide" style={{ color: "var(--warm-gray-400)" }}>支出合計</p>
            <p className="font-amount text-lg font-bold" style={{ color: "var(--ink)" }}>¥{ledger.totalSpent.toLocaleString()}</p>
          </div>
          <div>
            <p className="text-[10px] tracking-wide" style={{ color: "var(--warm-gray-400)" }}>日平均</p>
            <p className="font-amount text-lg font-bold" style={{ color: "var(--accent)" }}>¥{dailyAverage.toLocaleString()}</p>
          </div>
          <div>
            <p className="text-[10px] tracking-wide" style={{ color: "var(--warm-gray-400)" }}>件数</p>
            <p className="font-amount text-lg font-bold" style={{ color: "var(--ink)" }}>{ledger.itemCount}</p>
          </div>
        </div>
      </section>

      <div className="grid grid-cols-3 gap-1 rounded p-1" style={{ backgroundColor: "var(--warm-gray-50)" }}>
        {([
          ["daily", "日別"],
          ["summary", "集計"],
          ["trend", "推移"],
        ] as [RecordTab, string][]).map(([tab, label]) => (
          <button
            key={tab}
            onClick={() => changeTab(tab)}
            className="py-2 rounded text-sm font-medium transition-colors"
            style={{
              backgroundColor: activeTab === tab ? "var(--bg-card)" : "transparent",
              color: activeTab === tab ? "var(--accent)" : "var(--warm-gray-500)",
              boxShadow: activeTab === tab ? "0 1px 4px rgba(0,0,0,0.06)" : "none",
            }}
          >
            {label}
          </button>
        ))}
      </div>

      {activeTab === "daily" && (
        <DailyTab
          groups={ledger.dailyGroups}
          selectedDate={selectedDate}
          expandedDates={expandedDates}
          expandedCategories={expandedCategories}
          onToggleDate={toggleDate}
          onToggleCategory={toggleCategory}
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

      <button
        type="button"
        onClick={() => openEntrySheet()}
        disabled={ledger.context.isLocked}
        className="fixed right-5 z-40 px-5 py-3 rounded-full text-sm font-bold shadow-lg active:scale-[0.98] disabled:opacity-50"
        style={{ bottom: "82px", backgroundColor: "var(--accent)", color: "#FFFFFF" }}
      >
        ＋入力
      </button>

      {entryOpen && (
        <EntrySheet
          amount={amount}
          category={category}
          date={date}
          display={display}
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

function DailyTab({
  groups,
  selectedDate,
  expandedDates,
  expandedCategories,
  onToggleDate,
  onToggleCategory,
  onEdit,
  onDelete,
}: {
  groups: DailyLedgerGroup[];
  selectedDate: string;
  expandedDates: string[];
  expandedCategories: string[];
  onToggleDate: (date: string) => void;
  onToggleCategory: (key: string) => void;
  onEdit: (date?: string, item?: LedgerItem) => void;
  onDelete: (item: LedgerItem) => void;
}) {
  return (
    <div className="space-y-2">
      {groups.map((day) => {
        const expanded = expandedDates.includes(day.date);
        const isSelected = selectedDate === day.date;
        return (
          <section
            key={day.date}
            data-ledger-date={day.date}
            className="card overflow-hidden scroll-mt-24"
            style={{ opacity: day.total === 0 ? 0.58 : 1 }}
          >
            <button
              type="button"
              onClick={() => onToggleDate(day.date)}
              className="w-full flex items-center justify-between px-4 py-3 text-left"
              style={{ borderLeft: isSelected ? "3px solid var(--accent)" : "3px solid transparent" }}
            >
              <div>
                <p className="text-sm font-medium" style={{ color: "var(--ink)" }}>{formatDateLabel(day.date)}</p>
                <p className="text-[10px]" style={{ color: "var(--warm-gray-400)" }}>{day.count > 0 ? `${day.count}件` : "記録なし"}</p>
              </div>
              <div className="text-right">
                <p className="font-amount text-base font-bold" style={{ color: day.total > 0 ? "var(--ink)" : "var(--warm-gray-300)" }}>
                  ¥{day.total.toLocaleString()}
                </p>
                <span className="text-xs" style={{ color: "var(--warm-gray-300)" }}>{expanded ? "閉じる" : "詳細"}</span>
              </div>
            </button>

            {expanded && (
              <div className="px-4 pb-4 space-y-2" style={{ borderTop: "1px solid var(--border)" }}>
                {day.categories.length === 0 ? (
                  <p className="text-sm text-center py-4" style={{ color: "var(--warm-gray-300)" }}>この日の支出はありません</p>
                ) : day.categories.map((group) => {
                  const key = `${day.date}-${group.category}`;
                  const catExpanded = expandedCategories.includes(key);
                  return (
                    <div key={key} className="rounded" style={{ backgroundColor: "var(--warm-gray-50)" }}>
                      <button
                        type="button"
                        onClick={() => onToggleCategory(key)}
                        className="w-full flex items-center justify-between px-3 py-2.5 text-left"
                      >
                        <span className="text-sm font-medium" style={{ color: "var(--ink-light)" }}>
                          {group.icon || "📦"} {group.category}
                        </span>
                        <span className="font-amount text-sm font-semibold" style={{ color: "var(--ink)" }}>¥{group.total.toLocaleString()}</span>
                      </button>
                      {catExpanded && (
                        <div className="px-3 pb-3 space-y-2">
                          {group.items.map((item) => (
                            <LedgerItemRow
                              key={item.id}
                              item={item}
                              onEdit={() => onEdit(day.date, item)}
                              onDelete={() => onDelete(item)}
                            />
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
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
  return (
    <div className="rounded p-3" style={{ backgroundColor: "var(--bg-card)", border: "1px solid var(--border)" }}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-medium truncate" style={{ color: "var(--ink)" }}>
            {item.memo || item.category}
          </p>
          <p className="text-[10px] mt-0.5" style={{ color: "var(--warm-gray-400)" }}>
            {isManual ? (item.paymentMethod ? PAYMENT_LABELS[item.paymentMethod] : "手入力") : "ワリカン同期"}
          </p>
          {item.readonlyReason && (
            <p className="text-[10px] mt-1" style={{ color: "var(--accent)" }}>{item.readonlyReason}</p>
          )}
        </div>
        <div className="text-right shrink-0">
          <p className="font-amount text-sm font-bold" style={{ color: "var(--ink)" }}>¥{item.amount.toLocaleString()}</p>
          {isManual && (
            <div className="flex gap-2 justify-end mt-2">
              <button
                type="button"
                onClick={onEdit}
                disabled={!item.editable}
                className="text-[10px] px-2 py-1 rounded disabled:opacity-40"
                style={{ backgroundColor: "var(--accent-light)", color: "var(--accent-dark)" }}
              >
                編集
              </button>
              <button
                type="button"
                onClick={onDelete}
                disabled={!item.deleteable}
                className="text-[10px] px-2 py-1 rounded disabled:opacity-40"
                style={{ backgroundColor: "var(--error-light)", color: "var(--error)" }}
              >
                削除
              </button>
            </div>
          )}
        </div>
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

function EntrySheet({
  amount,
  category,
  date,
  display,
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
  display: string;
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
        className="w-full max-w-lg max-h-[calc(100dvh-12px)] overflow-y-auto rounded-t-lg p-4 pb-0 space-y-4"
        style={{ backgroundColor: "var(--bg)", border: "1px solid var(--border)", borderBottom: "none" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h2 className="text-base font-medium" style={{ color: "var(--ink)" }}>{editing ? "支出を編集" : "支出を入力"}</h2>
          <button onClick={onClose} className="text-sm px-2 py-1" style={{ color: "var(--warm-gray-400)" }}>閉じる</button>
        </div>

        <div className="card p-4">
          {expression && <p className="text-xs font-amount text-right mb-1" style={{ color: "var(--warm-gray-400)" }}>{expression}</p>}
          <div className="flex items-baseline gap-2 justify-end">
            <span className="font-amount text-lg" style={{ color: "var(--warm-gray-300)" }}>¥</span>
            <span className="font-amount font-extrabold" style={{ fontSize: "34px", color: display === "0" ? "var(--warm-gray-200)" : "var(--ink)" }}>
              {display === "0" ? "0" : parseInt(display).toLocaleString()}
            </span>
          </div>
        </div>

        <div>
          <label className="text-xs font-light tracking-wide block mb-2" style={{ color: "var(--warm-gray-400)" }}>カテゴリ</label>
          <div className="flex gap-2 overflow-x-auto pb-2">
            {categories.map((cat) => (
              <button
                key={cat.id}
                type="button"
                onClick={() => onCategoryChange(cat.name)}
                className="shrink-0 px-3 py-2 rounded-full text-xs font-medium"
                style={{
                  backgroundColor: category === cat.name ? "var(--accent)" : "var(--warm-gray-50)",
                  color: category === cat.name ? "#FFFFFF" : "var(--warm-gray-600)",
                  border: category === cat.name ? "1px solid var(--accent)" : "1px solid var(--border)",
                }}
              >
                {cat.icon} {cat.name}
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs font-light tracking-wide block mb-1.5" style={{ color: "var(--warm-gray-400)" }}>日付</label>
            <input
              type="date"
              value={date}
              onChange={(e) => onDateChange(e.target.value)}
              className="w-full rounded px-3 py-2 outline-none"
              style={{ fontSize: "16px", border: "1px solid var(--border)", color: "var(--ink)" }}
            />
          </div>
          <div>
            <label className="text-xs font-light tracking-wide block mb-1.5" style={{ color: "var(--warm-gray-400)" }}>メモ</label>
            <input
              type="text"
              value={memo}
              onChange={(e) => onMemoChange(e.target.value)}
              placeholder="任意"
              className="w-full rounded px-3 py-2 outline-none"
              style={{ fontSize: "16px", border: "1px solid var(--border)", color: "var(--ink)" }}
            />
          </div>
        </div>

        <div>
          <label className="text-xs font-light tracking-wide block mb-2" style={{ color: "var(--warm-gray-400)" }}>支払い方法</label>
          <div className="grid grid-cols-2 gap-2">
            {PAYMENT_METHODS.map((pm) => (
              <button
                key={pm.key}
                type="button"
                onClick={() => onPaymentChange(pm.key)}
                className="py-2.5 rounded text-xs font-medium"
                style={{
                  backgroundColor: paymentMethod === pm.key ? "var(--accent-light)" : "var(--warm-gray-50)",
                  color: paymentMethod === pm.key ? "var(--accent-dark)" : "var(--warm-gray-600)",
                  border: paymentMethod === pm.key ? "1px solid var(--accent-muted)" : "1px solid var(--border)",
                }}
              >
                {pm.icon} {pm.label}
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-4 gap-1.5">
          {[
            { k: "7", l: "7", s: "n" }, { k: "8", l: "8", s: "n" }, { k: "9", l: "9", s: "n" }, { k: "back", l: "⌫", s: "f" },
            { k: "4", l: "4", s: "n" }, { k: "5", l: "5", s: "n" }, { k: "6", l: "6", s: "n" }, { k: "+", l: "+", s: "o" },
            { k: "1", l: "1", s: "n" }, { k: "2", l: "2", s: "n" }, { k: "3", l: "3", s: "n" }, { k: "-", l: "−", s: "o" },
            { k: "C", l: "C", s: "c" }, { k: "0", l: "0", s: "n" }, { k: "00", l: "00", s: "n" }, { k: "=", l: "=", s: "e" },
          ].map(({ k, l, s }) => (
            <button
              key={k}
              type="button"
              onClick={() => onCalcPress(k)}
              className="font-amount font-bold select-none active:scale-[0.97]"
              style={{
                height: "46px",
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

        <div
          className="sticky bottom-0 -mx-4 px-4 pt-2"
          style={{ backgroundColor: "var(--bg)", paddingBottom: "calc(16px + env(safe-area-inset-bottom))" }}
        >
          <button
            type="button"
            onClick={onSave}
            disabled={saving || !amount || !category}
            className="w-full py-3.5 text-base font-bold disabled:opacity-40 active:scale-[0.98]"
            style={{ borderRadius: "4px", backgroundColor: "var(--accent)", color: "#FFFFFF" }}
          >
            {saving ? "保存中..." : editing ? "更新する" : "記録する"}
          </button>
        </div>
      </div>
    </div>
  );
}
