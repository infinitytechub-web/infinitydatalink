import { describe, expect, it } from "vitest";
import { reminderStage } from "../loan-reminder-stage";

describe("repayment reminder stages", () => {
  it("reminds 3 days before the due date", () => {
    expect(reminderStage("2026-11-25", "2026-11-22")).toBe("due_3d");
  });
  it("does not remind 4 days before", () => {
    expect(reminderStage("2026-11-26", "2026-11-22")).toBeNull();
  });
  it("reminds on the due date", () => {
    expect(reminderStage("2026-11-22", "2026-11-22")).toBe("due_today");
  });
  it("sends the first overdue reminder 1 day late", () => {
    expect(reminderStage("2026-11-21", "2026-11-22")).toBe("overdue_1");
  });
  it("escalates at 7 and 14 days late", () => {
    expect(reminderStage("2026-11-15", "2026-11-22")).toBe("overdue_7");
    expect(reminderStage("2026-11-01", "2026-11-22")).toBe("overdue_14");
  });
});
