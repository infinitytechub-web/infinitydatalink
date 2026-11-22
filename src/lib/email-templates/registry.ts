import type { ComponentType } from "react";
import { template as kycApprovedTemplate } from "./kyc-approved";
import { template as kycRejectedTemplate } from "./kyc-rejected";
import { template as repaymentReminderTemplate } from "./repayment-reminder";

export interface TemplateEntry {
  component: ComponentType<any>;
  subject: string | ((data: Record<string, any>) => string);
  displayName?: string;
  previewData?: Record<string, any>;
  /** Fixed recipient — overrides caller-provided recipientEmail when set. */
  to?: string;
}

export const TEMPLATES: Record<string, TemplateEntry> = {
  "kyc-approved": kycApprovedTemplate,
  "kyc-rejected": kycRejectedTemplate,
  "repayment-reminder": repaymentReminderTemplate,
};
