/** 給料日サイクル: 25日〜翌月24日 */

export function getCurrentPeriod(): { year: number; month: number; start: string; end: string; label: string } {
  const today = new Date();
  return getPeriodForDate(today);
}

export function getPeriodForDate(date: Date): { year: number; month: number; start: string; end: string; label: string } {
  const y = date.getFullYear();
  const m = date.getMonth() + 1; // 1-indexed
  const d = date.getDate();

  // 25日以降 → 当月度, 24日以前 → 前月度
  let periodMonth: number;
  let periodYear: number;
  if (d >= 25) {
    periodMonth = m;
    periodYear = y;
  } else {
    periodMonth = m - 1;
    periodYear = y;
    if (periodMonth === 0) {
      periodMonth = 12;
      periodYear = y - 1;
    }
  }

  const start = formatDate(periodYear, periodMonth, 25);
  const endMonth = periodMonth + 1;
  const endYear = endMonth > 12 ? periodYear + 1 : periodYear;
  const end = formatDate(endYear, endMonth > 12 ? 1 : endMonth, 24);

  return {
    year: periodYear,
    month: periodMonth,
    start,
    end,
    label: `${periodMonth}月度（${periodMonth}/25〜${endMonth > 12 ? 1 : endMonth}/24）`,
  };
}

export function getAdjacentPeriod(year: number, month: number, direction: -1 | 1) {
  let newMonth = month + direction;
  let newYear = year;
  if (newMonth === 0) {
    newMonth = 12;
    newYear -= 1;
  } else if (newMonth === 13) {
    newMonth = 1;
    newYear += 1;
  }
  const start = formatDate(newYear, newMonth, 25);
  const endMonth = newMonth + 1;
  const endYear = endMonth > 12 ? newYear + 1 : newYear;
  const end = formatDate(endYear, endMonth > 12 ? 1 : endMonth, 24);

  return {
    year: newYear,
    month: newMonth,
    start,
    end,
    label: `${newMonth}月度（${newMonth}/25〜${endMonth > 12 ? 1 : endMonth}/24）`,
  };
}

/** 残り日数（今日含む） */
export function getRemainingDays(endDate: string): number {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const end = new Date(endDate + "T00:00:00");
  const diff = end.getTime() - today.getTime();
  return Math.max(1, Math.ceil(diff / (1000 * 60 * 60 * 24)) + 1);
}

/** 先月の月度を取得（光熱費参照用） */
export function getPreviousPeriodMonth(): { year: number; month: number } {
  const current = getCurrentPeriod();
  let prevMonth = current.month - 1;
  let prevYear = current.year;
  if (prevMonth === 0) {
    prevMonth = 12;
    prevYear -= 1;
  }
  return { year: prevYear, month: prevMonth };
}

function formatDate(y: number, m: number, d: number): string {
  return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}
