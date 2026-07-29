import * as React from "react";
import {
  Body,
  Button,
  Container,
  Head,
  Heading,
  Html,
  Preview,
  Section,
  Text,
} from "@react-email/components";
import type { TemplateEntry } from "./registry";

interface Props {
  siteName?: string;
  memberName?: string;
  heading?: string;
  message?: string;
  actionLabel?: string;
  appUrl?: string;
}

const AccountAlertEmail = ({
  siteName = "IT-360 CashApp",
  memberName,
  heading = "Account update",
  message = "There is an update on your account.",
  actionLabel = "Open member portal",
  appUrl = "https://it-360cashapp.lovable.app/app",
}: Props) => (
  <Html lang="en" dir="ltr">
    <Head />
    <Preview>{heading}</Preview>
    <Body style={main}>
      <Container style={container}>
        <Heading style={h1}>{heading}</Heading>
        <Text style={text}>{memberName ? `Hi ${memberName},` : "Hello,"}</Text>
        <Text style={text}>{message}</Text>
        <Section style={{ textAlign: "center", margin: "28px 0" }}>
          <Button style={button} href={appUrl}>
            {actionLabel}
          </Button>
        </Section>
        <Text style={footer}>
          You are receiving this because of activity on your {siteName} account.
          You can change alert settings in the member portal.
        </Text>
      </Container>
    </Body>
  </Html>
);

export const template = {
  component: AccountAlertEmail,
  subject: (data: Record<string, any>) => data?.heading ?? "Account update",
  displayName: "Account alert",
  previewData: {
    memberName: "Jane",
    heading: "Loan approved",
    message: "Your loan application LN-1024 for 5,000.00 was approved.",
  },
} satisfies TemplateEntry;

export default AccountAlertEmail;

const main = { backgroundColor: "#ffffff", fontFamily: "Arial, Helvetica, sans-serif" };
const container = { padding: "24px 28px", maxWidth: "560px" };
const h1 = { fontSize: "22px", color: "#0f766e", margin: "0 0 16px" };
const text = { fontSize: "15px", lineHeight: "24px", color: "#1f2937" };
const button = {
  backgroundColor: "#0f766e",
  color: "#ffffff",
  borderRadius: "8px",
  padding: "12px 22px",
  fontSize: "14px",
  textDecoration: "none",
};
const footer = { fontSize: "12px", color: "#6b7280", marginTop: "24px" };
