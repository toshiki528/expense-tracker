import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

// --- Types for this app's tables ---

export type PersonalExpense = {
  id: string;
  amount: number;
  category: string;
  payment_method: string;
  memo: string | null;
  expense_date: string;
  created_at: string;
  updated_at: string;
};

export type PersonalSettings = {
  id: string;
  monthly_income: number;
  savings_amount: number;
  savings_percent: number | null;
  savings_source: "manual" | "kakeibo";
  updated_at: string;
};

export type PersonalCategory = {
  id: string;
  name: string;
  icon: string;
  sort_order: number;
  is_default: boolean;
  is_active: boolean;
  budget_amount: number | null;
  created_at: string;
};

// --- Types for warikan tables (read-only) ---

export type FixedCost = {
  id: string;
  name: string;
  amount: number;
  payer: string;
  is_active: boolean;
  sort_order: number;
};

export type UtilityBill = {
  id: string;
  period: string;
  type: "electric" | "gas" | "water";
  amount: number;
  payer: string;
};

// --- Types for kakeibo tables (read-only) ---

export type MonthlySavings = {
  id: string;
  year: number;
  month: number;
  person: string;
  amount: number;
};
