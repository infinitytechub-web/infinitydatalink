import * as React from "react";
import { Body, Button, Container, Head, Heading, Html, Preview, Section, Text } from "@react-email/components";
import type { TemplateEntry } from "./registry";

interface Props {
  siteName?: string;
  memberName?: string;
  loanRef?: string;
  installmentNo?: number;
  amount?: string;
  dueDate?: string;
  overdue?: boolean;
  appUrl?: string;
}

const RepaymentReminderEmail = ({
  siteName = "IT-360 CashApp",
  memberName,
  loanRef = "your loan",
  installmentNo,
  amount,
  dueDate,
  overdue = false,
  appUrl = "https://infinitydatalink.com/app/repayments",
}: Props) => (
  <Html lang="en" dir="ltr">
    <Head />
    <Preview>{overdue ? "Your loan installment is overdue" : "Your loan installment is due soon"}</Preview>
    <Body style={main}>
      <Container style={container}>
        <Heading style={h1}>{overdue ? "Installment overdue" : "Installment due"}</Heading>
        <Text style={text}>
          {memberName ? `Hi ${memberName},` : "Hello,"}{" "}
          {overdue
            ? `installment${installmentNo ? ` #${installmentNo}` : ""} on loan ${loanRef} was due on ${dueDate ?? "its due date"} and has not been fully paid.`
            : `installment${installmentNo ? ` #${installmentNo}` : ""} on loan ${loanRef} is due on ${dueDate ?? "its due date"}.`}
        </Text>
        {amount ? (
          <Text style={amountStyle}>
            Amount due: <strong>GH₵ {amount}</strong>
          </Text>
        ) : null}
        <Text style={text}>
          {overdue
            ? "Please pay as soon as possible to avoid penalties and keep your account in good standing."
            : "Paying on time keeps your account in good standing."}
        </Text>
        <Section style={{ textAlign: "center", margin: "28px 0" }}>
          <Button style={button} href={appUrl}>
            Pay now
          </Button>
        </Section>
        <Text style={footer}>{siteName}</Text>
      </Container>
    </Body>
  </Html>
);

export const template = {
  component: RepaymentReminderEmail,
  subject: (d: Record<string, any>) =>
    d["overdue"] ? `Overdue: loan ${d["loanRef"] ?? ""} installment` : `Reminder: loan ${d["loanRef"] ?? ""} installment due`,
  displayName: "Loan · Repayment reminder",
  previewData: { memberName: "Ama", loanRef: "LN-1042", installmentNo: 3, amount: "458.40", dueDate: "25 Nov 2026" },
} satisfies TemplateEntry;

export default RepaymentReminderEmail;

const main = { backgroundColor: "#ffffff", fontFamily: "Arial, sans-serif" };
const container = { padding: "24px 28px", maxWidth: "560px" };
const h1 = { fontSize: "22px", color: "#0f4c4a", margin: "0 0 16px" };
const text = { fontSize: "14px", lineHeight: "22px", color: "#334155" };
const amountStyle = { fontSize: "16px", color: "#0f4c4a" };
const button = { backgroundColor: "#0f766e", color: "#ffffff", padding: "12px 22px", borderRadius: "6px", fontSize: "14px", textDecoration: "none" };
const footer = { fontSize: "12px", color: "#94a3b8", marginTop: "24px" };
