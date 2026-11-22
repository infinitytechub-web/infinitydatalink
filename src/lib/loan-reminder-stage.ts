/**
 * Decide which repayment reminder (if any) applies to an unpaid installment.
 * Due: 3 days before and on the due date. Overdue: 1, 7 and 14 days late —
 * only the highest stage reached is returned so a long-overdue installment
 * never triggers a burst of older reminders at once.
 */
export type ReminderStage = "due_3d" | "due_today" | "overdue_1" | "overdue_7" | "overdue_14";

export function reminderStage(dueDate: string, today: string): ReminderStage | null {
  const days = Math.round((Date.parse(`${dueDate}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86_400_000);
  if (days === 0) return "due_today";
  if (days > 0 && days <= 3) return "due_3d";
  if (days < 0) {
    const late = -days;
    if (late >= 14) return "overdue_14";
    if (late >= 7) return "overdue_7";
    return "overdue_1";
  }
  return null;
}

export function isOverdueStage(s: ReminderStage) {
  return s.startsWith("overdue");
}
