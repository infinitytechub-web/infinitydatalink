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
  appUrl?: string;
}

const KycApprovedEmail = ({
  siteName = "IT-360 CashApp",
  memberName,
  appUrl = "https://infinity-wealth360.lovable.app/app/kyc",
}: Props) => (
  <Html lang="en" dir="ltr">
    <Head />
    <Preview>Your KYC verification is approved</Preview>
    <Body style={main}>
      <Container style={container}>
        <Heading style={h1}>You're verified 🎉</Heading>
        <Text style={text}>
          {memberName ? `Hi ${memberName},` : "Hello,"} good news — your KYC verification for{" "}
          <strong>{siteName}</strong> has been approved.
        </Text>
        <Text style={text}>
          You now have full access to savings plans, loan applications, and all member benefits.
        </Text>
        <Section style={{ textAlign: "center", margin: "28px 0" }}>
          <Button style={button} href={appUrl}>
            Open member portal
          </Button>
        </Section>
        <Text style={footer}>If you didn't expect this email, please contact support.</Text>
      </Container>
    </Body>
  </Html>
);

export const template = {
  component: KycApprovedEmail,
  subject: "Your KYC verification is approved",
  displayName: "KYC · Approved",
  previewData: { memberName: "Jane" },
} satisfies TemplateEntry;

export default KycApprovedEmail;

const main = { backgroundColor: "#ffffff", fontFamily: "Arial, sans-serif" };
const container = { padding: "24px 28px", maxWidth: "560px" };
const h1 = { fontSize: "22px", fontWeight: "bold" as const, color: "#0a3d2c", margin: "0 0 20px" };
const text = { fontSize: "14px", color: "#334155", lineHeight: "1.6", margin: "0 0 16px" };
const button = {
  backgroundColor: "#0a3d2c",
  color: "#fbf7ee",
  fontSize: "14px",
  borderRadius: "8px",
  padding: "12px 22px",
  textDecoration: "none",
  fontWeight: "600" as const,
};
const footer = { fontSize: "12px", color: "#94a3b8", margin: "30px 0 0" };
