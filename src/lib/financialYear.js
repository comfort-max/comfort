import {
  format,
  parseISO,
  isValid,
  startOfMonth,
  endOfMonth,
  eachMonthOfInterval,
  subDays,
  getDaysInMonth,
} from "date-fns";

/**
 * @typedef {{ startMonth: number, startDay: number }} FinancialYearRule
 */

/** Default when settings are missing: India (1 April – 31 March). */
export const DEFAULT_FINANCIAL_YEAR_RULE = { startMonth: 4, startDay: 1 };

function pad2(n) {
  return String(n).padStart(2, "0");
}

/** Build rule from `company_settings` row (or any object with the same keys). */
export function normalizeFinancialYearRule(settings) {
  if (!settings || typeof settings !== "object") {
    return { ...DEFAULT_FINANCIAL_YEAR_RULE };
  }
  let m = Number(settings.financial_year_start_month);
  let d = Number(settings.financial_year_start_day);
  if (!Number.isFinite(m) || m < 1 || m > 12) {
    m = DEFAULT_FINANCIAL_YEAR_RULE.startMonth;
  }
  if (!Number.isFinite(d) || d < 1 || d > 31) {
    d = DEFAULT_FINANCIAL_YEAR_RULE.startDay;
  }
  const maxD = getDaysInMonth(new Date(2020, m - 1, 1));
  d = Math.min(Math.floor(d), maxD);
  return { startMonth: m, startDay: d };
}

function toYmd(dateOrString) {
  if (typeof dateOrString === "string") {
    const s = dateOrString.trim().slice(0, 10);
    return s.length === 10 ? s : "";
  }
  if (dateOrString instanceof Date && isValid(dateOrString)) {
    return format(dateOrString, "yyyy-MM-dd");
  }
  return "";
}

/**
 * Human label for one financial year (the year that *starts* on FY start date).
 * Calendar year (1 Jan): "2025". Split year (e.g. Apr start): "2025-26".
 */
export function formatFYLabel(fyStartYear, rule = DEFAULT_FINANCIAL_YEAR_RULE) {
  const r = rule || DEFAULT_FINANCIAL_YEAR_RULE;
  const y = Math.floor(Number(fyStartYear));
  if (r.startMonth === 1 && r.startDay === 1) {
    return String(y);
  }
  const y2 = (y + 1) % 100;
  return `${y}-${String(y2).padStart(2, "0")}`;
}

/**
 * @param {number} fyStartYear calendar year in which the FY begins (e.g. 2025 for FY starting Apr 2025)
 * @param {FinancialYearRule} [rule]
 */
export function getFYBounds(fyStartYear, rule = DEFAULT_FINANCIAL_YEAR_RULE) {
  const r = rule || DEFAULT_FINANCIAL_YEAR_RULE;
  const y = Math.floor(Number(fyStartYear));
  const startStr = `${y}-${pad2(r.startMonth)}-${pad2(r.startDay)}`;
  const start = parseISO(startStr);
  if (!isValid(start)) {
    const fb = getFYBounds(y, DEFAULT_FINANCIAL_YEAR_RULE);
    return { ...fb, label: formatFYLabel(y, r), fyStartYear: y };
  }
  const nextStartStr = `${y + 1}-${pad2(r.startMonth)}-${pad2(r.startDay)}`;
  const nextStart = parseISO(nextStartStr);
  const end = subDays(nextStart, 1);
  return {
    start: format(start, "yyyy-MM-dd"),
    end: format(end, "yyyy-MM-dd"),
    label: formatFYLabel(y, r),
    fyStartYear: y,
  };
}

/**
 * Which financial year (by its start calendar year) contains this date?
 */
export function getFYStartYearForDate(date, rule = DEFAULT_FINANCIAL_YEAR_RULE) {
  const r = rule || DEFAULT_FINANCIAL_YEAR_RULE;
  const ymd = toYmd(date);
  if (!ymd) {
    return getFYStartYearForDate(new Date(), r);
  }
  const y = parseInt(ymd.slice(0, 4), 10);
  for (const fyKey of [y - 1, y, y + 1]) {
    const { start, end } = getFYBounds(fyKey, r);
    if (ymd >= start && ymd <= end) {
      return fyKey;
    }
  }
  return y;
}

/**
 * Dropdown list of financial years around a centre FY start year.
 */
export function listFinancialYears(centerFyStartYear, rule = DEFAULT_FINANCIAL_YEAR_RULE, back = 4, forward = 2) {
  const r = rule || DEFAULT_FINANCIAL_YEAR_RULE;
  const cy = Math.floor(Number(centerFyStartYear));
  const list = [];
  for (let i = -back; i <= forward; i++) {
    const y = cy + i;
    const b = getFYBounds(y, r);
    list.push({
      value: String(y),
      label: `FY ${b.label} (${format(parseISO(b.start), "dd MMM yyyy")} - ${format(parseISO(b.end), "dd MMM yyyy")})`,
      ...b,
    });
  }
  return list;
}

export function getDefaultFYOption(now = new Date(), rule = DEFAULT_FINANCIAL_YEAR_RULE) {
  const r = rule || DEFAULT_FINANCIAL_YEAR_RULE;
  const cy = getFYStartYearForDate(now, r);
  return getFYBounds(cy, r);
}

/** Format calendar date range for report headers / exports. Returns "" if both empty. No FY suffix. */
export function formatPeriodForExport(dateFrom, dateTo, _rule = DEFAULT_FINANCIAL_YEAR_RULE) {
  const a = (dateFrom || "").trim();
  const b = (dateTo || "").trim();
  if (!a && !b) return "";
  const fmt = (iso) => {
    try {
      const d = parseISO(iso);
      if (!isValid(d)) return iso;
      return format(d, "dd MMM yyyy");
    } catch {
      return iso;
    }
  };
  if (a && b) {
    return `${fmt(a)} - ${fmt(b)}`;
  }
  if (a) return `From ${fmt(a)}`;
  return `Until ${fmt(b)}`;
}

/** `yyyy-MM` month inputs (HTML month type). No FY suffix. */
export function formatMonthRangeForExport(monthYearFrom, monthYearTo, _rule = DEFAULT_FINANCIAL_YEAR_RULE) {
  const x = (monthYearFrom || "").trim();
  const y = (monthYearTo || "").trim();
  if (!x && !y) return "";
  const fmtYm = (ym) => {
    try {
      const d = parseISO(`${ym}-01`);
      if (!isValid(d)) return ym;
      return format(d, "MMM yyyy");
    } catch {
      return ym;
    }
  };
  if (x && y) return `${fmtYm(x)} - ${fmtYm(y)}`;
  if (x) return `From ${fmtYm(x)}`;
  return `Until ${fmtYm(y)}`;
}

export function recordMonthIndex(year, month) {
  return year * 12 + (month || 1);
}

export function monthRangeFromDates(dateFrom, dateTo) {
  let fromIdx = null;
  let toIdx = null;
  if (dateFrom?.trim()) {
    const d = startOfMonth(parseISO(dateFrom.trim()));
    if (isValid(d)) fromIdx = d.getFullYear() * 12 + (d.getMonth() + 1);
  }
  if (dateTo?.trim()) {
    const d = endOfMonth(parseISO(dateTo.trim()));
    if (isValid(d)) toIdx = d.getFullYear() * 12 + (d.getMonth() + 1);
  }
  if (fromIdx != null && toIdx != null && fromIdx > toIdx) {
    const t = fromIdx;
    fromIdx = toIdx;
    toIdx = t;
  }
  return { fromIdx, toIdx };
}

export function salaryRecordInMonthRange(r, fromIdx, toIdx) {
  if (fromIdx == null && toIdx == null) return true;
  const idx = recordMonthIndex(r.year, r.month);
  if (fromIdx != null && idx < fromIdx) return false;
  if (toIdx != null && idx > toIdx) return false;
  return true;
}

export function monthLabelsBetweenDates(dateFrom, dateTo, rule = DEFAULT_FINANCIAL_YEAR_RULE) {
  void rule; // kept for API compatibility with callers
  const a = dateFrom?.trim() ? parseISO(dateFrom) : null;
  const b = dateTo?.trim() ? parseISO(dateTo) : null;
  if (!a || !b || !isValid(a) || !isValid(b)) return [];
  const start = startOfMonth(a <= b ? a : b);
  const end = endOfMonth(a <= b ? b : a);
  const months = eachMonthOfInterval({ start, end });
  const mNames = ["", "Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return months.map((d) => {
    const y = d.getFullYear();
    const m = d.getMonth() + 1;
    const key = `${y}-${String(m).padStart(2, "0")}`;
    return {
      key,
      label: `${mNames[m]} ${y}`,
      year: y,
      month: m,
    };
  });
}

/** @deprecated Use getFYStartYearForDate with explicit rule from company settings. */
export function getIndianFYStartYearForDate(date) {
  return getFYStartYearForDate(date, DEFAULT_FINANCIAL_YEAR_RULE);
}

/** @deprecated Use formatFYLabel */
export function formatIndianFYLabel(aprilYear) {
  return formatFYLabel(aprilYear, DEFAULT_FINANCIAL_YEAR_RULE);
}

/** @deprecated Use getFYBounds */
export function getIndianFYBounds(aprilYear) {
  return getFYBounds(aprilYear, DEFAULT_FINANCIAL_YEAR_RULE);
}

/** @deprecated Use listFinancialYears */
export function listIndianFinancialYears(centerAprilYear, back = 4, forward = 2) {
  return listFinancialYears(centerAprilYear, DEFAULT_FINANCIAL_YEAR_RULE, back, forward);
}

/** @deprecated Use getDefaultFYOption */
export function getDefaultIndianFYOption() {
  return getDefaultFYOption(new Date(), DEFAULT_FINANCIAL_YEAR_RULE);
}
