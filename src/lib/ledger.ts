import { getAdjacentPeriod } from "@/lib/salary-cycle";
import { supabase } from "@/lib/supabase";
import type { MonthlySnapshot, PersonalCategory, PersonalExpense, Receipt } from "@/lib/supabase";

export type SalaryPeriod = {
  year: number;
  month: number;
  start: string;
  end: string;
  label: string;
};

export type PaymentMethod = "cash" | "credit";

export type LedgerSource =
  | "manual"
  | "warikan_shared_food"
  | "warikan_daily"
  | "warikan_medical"
  | "warikan_personal";

export type LedgerItem = {
  id: string;
  source: LedgerSource;
  sourceId: string;
  date: string;
  amount: number;
  category: string;
  categoryIcon?: string;
  memo?: string;
  paymentMethod?: PaymentMethod;
  editable: boolean;
  deleteable: boolean;
  readonlyReason?: string;
};

export type LedgerPeriodContext = {
  year: number;
  month: number;
  period: string;
  startDate: string;
  endDate: string;
  label: string;
  snapshot: MonthlySnapshot | null;
  isLocked: boolean;
};

export type CategorySummary = {
  name: string;
  icon: string;
  spent: number;
  prevSpent: number;
  budget: number | null;
};

export type DailyCategoryGroup = {
  category: string;
  icon?: string;
  total: number;
  items: LedgerItem[];
};

export type DailyLedgerGroup = {
  date: string;
  total: number;
  count: number;
  categories: DailyCategoryGroup[];
};

export type MonthlyTrendPoint = {
  month: string;
  total: number;
};

export type LedgerDashboardData = {
  context: LedgerPeriodContext;
  categories: PersonalCategory[];
  manualCategories: PersonalCategory[];
  items: LedgerItem[];
  dailyGroups: DailyLedgerGroup[];
  categorySummary: CategorySummary[];
  monthlyTrend: MonthlyTrendPoint[];
  totalSpent: number;
  itemCount: number;
};

export const SYNC_CATEGORY_NAMES = ["共通食費", "共通日用品", "共通医療品", "個人消費"];

export const MANUAL_CATEGORY_ORDER = [
  "食費",
  "日用品",
  "交通費",
  "飲み物",
  "医療",
  "ガソリン代",
  "ETC代",
  "美容代",
  "衣服・服飾",
  "交際費",
  "旅行・レジャー",
  "家電・家具",
  "車両整備",
  "プレゼント・冠婚葬祭",
  "娯楽",
  "その他",
];

const SYNC_ICON_MAP: Record<string, string> = {
  "共通食費": "🍚",
  "共通日用品": "🧴",
  "共通医療品": "🏥",
  "個人消費": "🙋",
};

const DAYS = ["日", "月", "火", "水", "木", "金", "土"];

function formatDate(y: number, m: number, d: number): string {
  return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

function addDays(date: string, days: number): string {
  const d = new Date(date + "T00:00:00");
  d.setDate(d.getDate() + days);
  return formatDate(d.getFullYear(), d.getMonth() + 1, d.getDate());
}

function formatPeriod(year: number, month: number): string {
  return `${year}-${String(month).padStart(2, "0")}`;
}

function formatPeriodLabel(month: number, startDate: string, endDate: string): string {
  const s = new Date(startDate + "T00:00:00");
  const e = new Date(endDate + "T00:00:00");
  return `${month}月度（${s.getMonth() + 1}/${s.getDate()}〜${e.getMonth() + 1}/${e.getDate()}）`;
}

export function formatDateLabel(date: string): string {
  const d = new Date(date + "T00:00:00");
  return `${d.getMonth() + 1}/${d.getDate()}（${DAYS[d.getDay()]}）`;
}

function categoryIcon(name: string, categories: PersonalCategory[]): string | undefined {
  return categories.find((cat) => cat.name === name)?.icon || SYNC_ICON_MAP[name];
}

function toPaymentMethod(value: string): PaymentMethod | undefined {
  return value === "cash" || value === "credit" ? value : undefined;
}

export function getDatesInRange(startDate: string, endDate: string): string[] {
  const dates: string[] = [];
  let current = startDate;
  while (current <= endDate) {
    dates.push(current);
    current = addDays(current, 1);
  }
  return dates;
}

export function sortManualCategories(categories: PersonalCategory[]): PersonalCategory[] {
  return categories
    .filter((cat) => cat.is_active && !SYNC_CATEGORY_NAMES.includes(cat.name))
    .sort((a, b) => {
      const ai = MANUAL_CATEGORY_ORDER.indexOf(a.name);
      const bi = MANUAL_CATEGORY_ORDER.indexOf(b.name);
      if (ai !== -1 || bi !== -1) {
        if (ai === -1) return 1;
        if (bi === -1) return -1;
        return ai - bi;
      }
      return a.sort_order - b.sort_order;
    });
}

export async function getLedgerPeriodContext(period: SalaryPeriod): Promise<LedgerPeriodContext> {
  const periodKey = formatPeriod(period.year, period.month);
  const { data } = await supabase
    .from("monthly_snapshots")
    .select("*")
    .eq("period", periodKey)
    .maybeSingle();
  const snapshot = (data as MonthlySnapshot | null) || null;
  const startDate = snapshot?.start_date || period.start;
  const endDate = snapshot?.end_date || period.end;

  return {
    year: period.year,
    month: period.month,
    period: periodKey,
    startDate,
    endDate,
    label: formatPeriodLabel(period.month, startDate, endDate),
    snapshot,
    isLocked: snapshot?.status === "locked",
  };
}

export async function getActiveCategories(): Promise<PersonalCategory[]> {
  const { data, error } = await supabase
    .from("personal_categories")
    .select("*")
    .eq("is_active", true)
    .order("sort_order");
  if (error) throw error;
  return (data || []) as PersonalCategory[];
}

export async function getLedgerItemsForPeriod(
  startDate: string,
  endDate: string,
  categories: PersonalCategory[],
  isLocked = false,
): Promise<LedgerItem[]> {
  const [{ data: manualData, error: manualError }, { data: receiptData, error: receiptError }] = await Promise.all([
    supabase
      .from("personal_expenses")
      .select("*")
      .gte("expense_date", startDate)
      .lte("expense_date", endDate)
      .order("expense_date", { ascending: false }),
    supabase
      .from("receipts")
      .select("*")
      .gte("date", startDate)
      .lte("date", endDate),
  ]);

  if (manualError) throw manualError;
  if (receiptError) throw receiptError;

  const lockReason = "確定済み月のため編集できません";
  const items: LedgerItem[] = ((manualData || []) as PersonalExpense[]).map((expense) => ({
    id: expense.id,
    source: "manual",
    sourceId: expense.id,
    date: expense.expense_date,
    amount: expense.amount,
    category: expense.category,
    categoryIcon: categoryIcon(expense.category, categories),
    memo: expense.memo || undefined,
    paymentMethod: toPaymentMethod(expense.payment_method),
    editable: !isLocked,
    deleteable: !isLocked,
    readonlyReason: isLocked ? lockReason : undefined,
  }));

  for (const receipt of ((receiptData || []) as Receipt[])) {
    const common = {
      sourceId: receipt.id,
      date: receipt.date,
      memo: receipt.store_name,
      editable: false,
      deleteable: false,
      readonlyReason: "ワリカンで変更してください",
    };

    const sharedFood = Math.floor((receipt.shared_total || 0) / 2);
    if (sharedFood > 0) {
      items.push({
        ...common,
        id: `warikan-food-${receipt.id}`,
        source: "warikan_shared_food",
        amount: sharedFood,
        category: "共通食費",
        categoryIcon: categoryIcon("共通食費", categories),
      });
    }

    const daily = Math.floor((receipt.daily_items_total || 0) / 2);
    if (daily > 0) {
      items.push({
        ...common,
        id: `warikan-daily-${receipt.id}`,
        source: "warikan_daily",
        amount: daily,
        category: "共通日用品",
        categoryIcon: categoryIcon("共通日用品", categories),
      });
    }

    const medical = Math.floor((receipt.medical_items_total || 0) / 2);
    if (medical > 0) {
      items.push({
        ...common,
        id: `warikan-medical-${receipt.id}`,
        source: "warikan_medical",
        amount: medical,
        category: "共通医療品",
        categoryIcon: categoryIcon("共通医療品", categories),
      });
    }

    // Preserve the existing expense-tracker behavior: receipt.personal_total is used as Toshiki's personal share.
    if ((receipt.personal_total || 0) > 0) {
      items.push({
        ...common,
        id: `warikan-personal-${receipt.id}`,
        source: "warikan_personal",
        amount: receipt.personal_total,
        category: "個人消費",
        categoryIcon: categoryIcon("個人消費", categories),
      });
    }
  }

  return items.sort((a, b) => b.date.localeCompare(a.date));
}

export function groupLedgerItemsByDate(
  items: LedgerItem[],
  startDate: string,
  endDate: string,
): DailyLedgerGroup[] {
  const groups = new Map<string, LedgerItem[]>();
  for (const date of getDatesInRange(startDate, endDate)) groups.set(date, []);
  for (const item of items) {
    if (!groups.has(item.date)) groups.set(item.date, []);
    groups.get(item.date)!.push(item);
  }

  return Array.from(groups.entries())
    .sort(([a], [b]) => b.localeCompare(a))
    .map(([date, dayItems]) => {
      const categoryMap = new Map<string, LedgerItem[]>();
      for (const item of dayItems) {
        if (!categoryMap.has(item.category)) categoryMap.set(item.category, []);
        categoryMap.get(item.category)!.push(item);
      }
      const categories = Array.from(categoryMap.entries())
        .map(([category, categoryItems]) => ({
          category,
          icon: categoryItems[0]?.categoryIcon,
          total: categoryItems.reduce((sum, item) => sum + item.amount, 0),
          items: categoryItems.sort((a, b) => b.amount - a.amount),
        }))
        .sort((a, b) => b.total - a.total);

      return {
        date,
        total: dayItems.reduce((sum, item) => sum + item.amount, 0),
        count: dayItems.length,
        categories,
      };
    });
}

export function summarizeLedgerItemsByCategory(
  items: LedgerItem[],
  categories: PersonalCategory[],
  prevItems: LedgerItem[] = [],
): CategorySummary[] {
  const prevMap = new Map<string, number>();
  for (const item of prevItems) {
    prevMap.set(item.category, (prevMap.get(item.category) || 0) + item.amount);
  }

  const map = new Map<string, number>();
  for (const item of items) {
    map.set(item.category, (map.get(item.category) || 0) + item.amount);
  }

  Array.from(prevMap.keys()).forEach((category) => {
    if (!map.has(category)) map.set(category, 0);
  });

  return Array.from(map.entries())
    .map(([name, spent]) => ({
      name,
      icon: categoryIcon(name, categories) || "📦",
      spent,
      prevSpent: prevMap.get(name) || 0,
      budget: categories.find((cat) => cat.name === name)?.budget_amount ?? null,
    }))
    .filter((summary) => summary.spent > 0 || summary.prevSpent > 0)
    .sort((a, b) => b.spent - a.spent);
}

export async function getMonthlyTrend(
  anchorPeriod: SalaryPeriod,
  monthCount: number,
  categories: PersonalCategory[] = [],
): Promise<MonthlyTrendPoint[]> {
  const periods: SalaryPeriod[] = [];
  let cursor = anchorPeriod;
  for (let i = 0; i < monthCount; i++) {
    periods.unshift(cursor);
    cursor = getAdjacentPeriod(cursor.year, cursor.month, -1);
  }

  const trend = await Promise.all(periods.map(async (period) => {
    const context = await getLedgerPeriodContext(period);
    const items = await getLedgerItemsForPeriod(context.startDate, context.endDate, categories, context.isLocked);
    return {
      month: `${period.month}月`,
      total: items.reduce((sum, item) => sum + item.amount, 0),
    };
  }));

  return trend;
}

export async function compareWithPreviousPeriod(
  period: SalaryPeriod,
  categories: PersonalCategory[],
): Promise<CategorySummary[]> {
  const current = await getLedgerPeriodContext(period);
  const previousPeriod = getAdjacentPeriod(period.year, period.month, -1);
  const previous = await getLedgerPeriodContext(previousPeriod);
  const [items, prevItems] = await Promise.all([
    getLedgerItemsForPeriod(current.startDate, current.endDate, categories, current.isLocked),
    getLedgerItemsForPeriod(previous.startDate, previous.endDate, categories, previous.isLocked),
  ]);
  return summarizeLedgerItemsByCategory(items, categories, prevItems);
}

export async function getLedgerDashboardData(period: SalaryPeriod): Promise<LedgerDashboardData> {
  const categories = await getActiveCategories();
  const context = await getLedgerPeriodContext(period);
  const previousPeriod = getAdjacentPeriod(period.year, period.month, -1);
  const previousContext = await getLedgerPeriodContext(previousPeriod);

  const [items, prevItems, monthlyTrend] = await Promise.all([
    getLedgerItemsForPeriod(context.startDate, context.endDate, categories, context.isLocked),
    getLedgerItemsForPeriod(previousContext.startDate, previousContext.endDate, categories, previousContext.isLocked),
    getMonthlyTrend(period, 6, categories),
  ]);

  return {
    context,
    categories,
    manualCategories: sortManualCategories(categories),
    items,
    dailyGroups: groupLedgerItemsByDate(items, context.startDate, context.endDate),
    categorySummary: summarizeLedgerItemsByCategory(items, categories, prevItems),
    monthlyTrend,
    totalSpent: items.reduce((sum, item) => sum + item.amount, 0),
    itemCount: items.length,
  };
}
