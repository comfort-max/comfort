/** Must stay in sync with Staff Wages expense descriptions created from Salary → Record Payment. */
import { CALENDAR_MONTH_NAMES } from "./utils";

export const SALARY_EXPENSE_MONTH_NAMES = CALENDAR_MONTH_NAMES;

/**
 * @param {{ month?: number; year?: number; employee_name?: string | null }} record
 */
export function buildStaffWagesExpenseDescription(record) {
  const monthIdx = Math.min(Math.max((record.month || 1) - 1, 0), 11);
  const monthName = SALARY_EXPENSE_MONTH_NAMES[monthIdx];
  return `Salary payment for ${monthName} ${record.year} - ${record.employee_name || ""}`;
}
