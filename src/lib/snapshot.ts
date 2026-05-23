import { supabase } from "@/lib/supabase";
import type { MonthlySnapshot, SnapshotDetail } from "@/lib/supabase";
import { getDefaultSalaryPayDate, getNextMonthSalaryPayDate, getPreviousPeriodMonth } from "@/lib/salary-cycle";

/** Fetch snapshot for a period, creating from master if not found */
export async function getOrCreateSnapshot(year: number, month: number): Promise<MonthlySnapshot> {
  const period = `${year}-${String(month).padStart(2, "0")}`;
  const { data } = await supabase.from("monthly_snapshots").select("*").eq("period", period).single();
  if (data) return data as MonthlySnapshot;

  const snapshot = await buildSnapshotFromMaster(year, month);
  const { data: inserted, error } = await supabase.from("monthly_snapshots").insert(snapshot).select().single();
  if (error) {
    // Race condition: another tab may have inserted
    const { data: retry } = await supabase.from("monthly_snapshots").select("*").eq("period", period).single();
    if (retry) return retry as MonthlySnapshot;
    throw error;
  }
  return inserted as MonthlySnapshot;
}

/** Build a snapshot object from current master tables */
export async function buildSnapshotFromMaster(year: number, month: number): Promise<Omit<MonthlySnapshot, "id" | "created_at" | "updated_at">> {
  const period = `${year}-${String(month).padStart(2, "0")}`;
  const salaryPayDate = getDefaultSalaryPayDate(year, month);
  const endDateRaw = getNextMonthSalaryPayDate(year, month);
  // end_date = day before next salary pay date
  const endD = new Date(endDateRaw + "T00:00:00");
  endD.setDate(endD.getDate() - 1);
  const endDate = `${endD.getFullYear()}-${String(endD.getMonth() + 1).padStart(2, "0")}-${String(endD.getDate()).padStart(2, "0")}`;

  // Fetch all master data in parallel
  const [
    { data: settingsData },
    { data: fixedData },
    { data: personalFixedData },
    { data: savingsData },
  ] = await Promise.all([
    supabase.from("personal_settings").select("*").limit(1).single(),
    supabase.from("fixed_costs").select("*").eq("is_active", true).order("sort_order"),
    supabase.from("personal_fixed_costs").select("*").eq("is_active", true).order("sort_order"),
    supabase.from("monthly_savings").select("amount").eq("year", year).eq("month", month).eq("person", "俊樹").single(),
  ]);

  // Utility bills: previous period month
  const prev = getPreviousPeriodMonth(year, month);
  const prevPeriodStr = `${prev.year}-${String(prev.month).padStart(2, "0")}`;
  const { data: utilityData } = await supabase.from("utility_bills").select("*").eq("period", prevPeriodStr);

  const settings = settingsData as { monthly_income: number; savings_amount: number; savings_percent: number | null; savings_source: string } | null;
  const monthlyIncome = settings?.monthly_income || 0;

  // Savings
  let savingsAmount = 0;
  let savingsSource: string | null = null;
  if (settings?.savings_source === "kakeibo") {
    savingsAmount = savingsData?.amount || 0;
    savingsSource = "kakeibo";
  } else if (settings) {
    savingsAmount = settings.savings_percent ? Math.floor(monthlyIncome * settings.savings_percent / 100) : (settings.savings_amount || 0);
    savingsSource = "manual";
  }

  // Fixed costs
  const fixedCosts = (fixedData || []).map((f: { name: string; amount: number }) => ({ name: f.name, amount: f.amount }));
  const sharedFixedTotal = fixedCosts.reduce((s: number, f: { amount: number }) => s + f.amount, 0);
  const sharedFixedMyShare = Math.floor(sharedFixedTotal / 2);

  // Personal fixed costs
  const personalFixedCosts = (personalFixedData || []).map((f: { name: string; amount: number }) => ({ name: f.name, amount: f.amount }));
  const personalFixedTotal = personalFixedCosts.reduce((s: number, f: { amount: number }) => s + f.amount, 0);

  // Utility bills
  const utilityBills = (utilityData || []).map((u: { type: string; amount: number; payer: string }) => ({ type: u.type, amount: u.amount, payer: u.payer }));
  const utilityTotal = utilityBills.reduce((s: number, u: { amount: number }) => s + u.amount, 0);
  const utilityMyShare = Math.floor(utilityTotal / 2);

  const availableAmount = monthlyIncome - savingsAmount - sharedFixedMyShare - personalFixedTotal - utilityMyShare;

  const snapshotDetail: SnapshotDetail = {
    fixed_costs: fixedCosts,
    personal_fixed_costs: personalFixedCosts,
    utility_bills: utilityBills,
    savings: { source: savingsSource || "manual", amount: savingsAmount, percent: settings?.savings_percent },
  };

  return {
    period,
    salary_pay_date: salaryPayDate,
    start_date: salaryPayDate,
    end_date: endDate,
    is_salary_pay_date_manual: false,
    monthly_income: monthlyIncome,
    savings_amount: savingsAmount,
    savings_source: savingsSource,
    shared_fixed_total: sharedFixedTotal,
    shared_fixed_my_share: sharedFixedMyShare,
    personal_fixed_total: personalFixedTotal,
    utility_period: prevPeriodStr,
    utility_total: utilityTotal,
    utility_my_share: utilityMyShare,
    available_amount: availableAmount,
    snapshot_detail: snapshotDetail,
    status: "open",
    synced_at: new Date().toISOString(),
    locked_at: null,
  };
}

/** Resync an open snapshot from master data */
export async function resyncSnapshot(snapshotId: string): Promise<MonthlySnapshot> {
  const { data: existing } = await supabase.from("monthly_snapshots").select("*").eq("id", snapshotId).single();
  if (!existing) throw new Error("Snapshot not found");
  const snap = existing as MonthlySnapshot;
  if (snap.status === "locked") throw new Error("Cannot resync locked snapshot");

  const fresh = await buildSnapshotFromMaster(
    parseInt(snap.period.split("-")[0]),
    parseInt(snap.period.split("-")[1]),
  );

  // Preserve manual salary pay date
  if (snap.is_salary_pay_date_manual) {
    fresh.salary_pay_date = snap.salary_pay_date;
    fresh.start_date = snap.start_date;
    fresh.end_date = snap.end_date;
    fresh.is_salary_pay_date_manual = true;
  }

  fresh.synced_at = new Date().toISOString();

  const { data: updated, error } = await supabase.from("monthly_snapshots")
    .update({ ...fresh, updated_at: new Date().toISOString() })
    .eq("id", snapshotId).select().single();
  if (error) throw error;
  return updated as MonthlySnapshot;
}

/** Update income for one open snapshot and recalculate derived totals */
export async function updateSnapshotIncome(snapshotId: string, monthlyIncome: number): Promise<MonthlySnapshot> {
  const { data: existing, error: fetchError } = await supabase.from("monthly_snapshots").select("*").eq("id", snapshotId).single();
  if (fetchError) throw fetchError;
  if (!existing) throw new Error("Snapshot not found");

  const snap = existing as MonthlySnapshot;
  if (snap.status === "locked") throw new Error("Cannot update locked snapshot");

  const detail = snap.snapshot_detail ?? {
    fixed_costs: [],
    personal_fixed_costs: [],
    utility_bills: [],
    savings: {
      source: snap.savings_source || "manual",
      amount: snap.savings_amount,
      percent: null,
    },
  };
  const savingsSource = snap.savings_source || detail.savings?.source || "manual";
  const savingsPercent = detail.savings?.percent;
  const savingsAmount = savingsSource === "manual" && typeof savingsPercent === "number"
    ? Math.floor((monthlyIncome * savingsPercent) / 100)
    : snap.savings_amount;
  const availableAmount = monthlyIncome
    - savingsAmount
    - snap.shared_fixed_my_share
    - snap.personal_fixed_total
    - snap.utility_my_share;
  const now = new Date().toISOString();

  const { data: updated, error } = await supabase.from("monthly_snapshots")
    .update({
      monthly_income: monthlyIncome,
      savings_amount: savingsAmount,
      savings_source: savingsSource,
      available_amount: availableAmount,
      snapshot_detail: {
        ...detail,
        savings: {
          ...(detail.savings || {}),
          source: savingsSource,
          amount: savingsAmount,
          percent: savingsPercent,
        },
      },
      updated_at: now,
    })
    .eq("id", snapshotId)
    .select()
    .single();
  if (error) throw error;
  return updated as MonthlySnapshot;
}

/** Lock a snapshot */
export async function lockSnapshot(snapshotId: string): Promise<MonthlySnapshot> {
  const now = new Date().toISOString();
  const { data, error } = await supabase.from("monthly_snapshots")
    .update({ status: "locked", locked_at: now, updated_at: now })
    .eq("id", snapshotId).select().single();
  if (error) throw error;
  return data as MonthlySnapshot;
}

/** Unlock a snapshot */
export async function unlockSnapshot(snapshotId: string): Promise<MonthlySnapshot> {
  const now = new Date().toISOString();
  const { data, error } = await supabase.from("monthly_snapshots")
    .update({ status: "open", locked_at: null, updated_at: now })
    .eq("id", snapshotId).select().single();
  if (error) throw error;
  return data as MonthlySnapshot;
}

/** Update salary pay date and recalculate dates */
export async function updateSalaryPayDate(
  snapshotId: string,
  newDate: string,
): Promise<{ snapshot: MonthlySnapshot; prevLockedWarning: boolean }> {
  const { data: existing } = await supabase.from("monthly_snapshots").select("*").eq("id", snapshotId).single();
  if (!existing) throw new Error("Snapshot not found");
  const snap = existing as MonthlySnapshot;

  const year = parseInt(snap.period.split("-")[0]);
  const month = parseInt(snap.period.split("-")[1]);

  // Recalculate end_date from next month's salary pay date
  const endDateRaw = getNextMonthSalaryPayDate(year, month);
  const endD = new Date(endDateRaw + "T00:00:00");
  endD.setDate(endD.getDate() - 1);
  const endDate = `${endD.getFullYear()}-${String(endD.getMonth() + 1).padStart(2, "0")}-${String(endD.getDate()).padStart(2, "0")}`;

  const now = new Date().toISOString();
  const { data: updated, error } = await supabase.from("monthly_snapshots")
    .update({
      salary_pay_date: newDate,
      start_date: newDate,
      end_date: endDate,
      is_salary_pay_date_manual: true,
      updated_at: now,
    })
    .eq("id", snapshotId).select().single();
  if (error) throw error;

  // Check if previous month snapshot needs end_date adjustment
  let prevLockedWarning = false;
  const prev = getPreviousPeriodMonth(year, month);
  const prevPeriod = `${prev.year}-${String(prev.month).padStart(2, "0")}`;
  const { data: prevSnap } = await supabase.from("monthly_snapshots").select("*").eq("period", prevPeriod).single();

  if (prevSnap) {
    const ps = prevSnap as MonthlySnapshot;
    if (ps.status === "locked") {
      prevLockedWarning = true;
    } else {
      // Adjust previous month's end_date to day before new salary pay date
      const prevEndD = new Date(newDate + "T00:00:00");
      prevEndD.setDate(prevEndD.getDate() - 1);
      const prevEndDate = `${prevEndD.getFullYear()}-${String(prevEndD.getMonth() + 1).padStart(2, "0")}-${String(prevEndD.getDate()).padStart(2, "0")}`;
      await supabase.from("monthly_snapshots")
        .update({ end_date: prevEndDate, updated_at: now })
        .eq("id", ps.id);
    }
  }

  return { snapshot: updated as MonthlySnapshot, prevLockedWarning };
}
