import * as React from "react";
import {
  Body,
  Button,
  Container,
  Head,
  Heading,
  Hr,
  Html,
  Preview,
  Section,
  Text,
} from "@react-email/components";
import type { TemplateEntry } from "./registry";

interface Props {
  siteName?: string;
  memberName?: string;
  reviewerNote?: string;
  appUrl?: string;
}

const KycRejectedEmail = ({
  siteName = "Infinity Wealth",
  memberName,
  reviewerNote,
  appUrl = "https://infinity-wealth360.lovable.app/app/profile",
}: Props) => (
  <Html lang="en" dir="ltr">
    <Head />
    <Preview>Action needed on your KYC verification</Preview>
    <Body style={main}>
      <Container style={container}>
        <Heading style={h1}>Action needed on your verification</Heading>
        <Text style={text}>
          {memberName ? `Hi ${memberName},` : "Hello,"} we reviewed your KYC
          submission for <strong>{siteName}</strong> and could not approve it as
          submitted.
        </Text>
        {reviewerNote ? (
          <Section style={noteBox}>
            <Text style={noteLabel}>Reviewer note</Text>
            <Text style={noteText}>{reviewerNote}</Text>
          </Section>
        ) : null}
        <Text style={text}>
          Please update your profile and re-upload the required documents.
          You'll be able to resubmit for another review right away.
        </Text>
        <Section style={{ textAlign: "center", margin: "28px 0" }}>
          <Button style={button} href={appUrl}>
            Update my profile
          </Button>
        </Section>
        <Hr style={hr} />
        <Text style={footer}>
          Need help? Reply to this email and our compliance team will assist.
        </Text>
      </Container>
    </Body>
  </Html>
);

export const template = {
  component: KycRejectedEmail,
  subject: "Action needed on your KYC verification",
  displayName: "KYC · Rejected",
  previewData: {
    memberName: "Jane",
    reviewerNote: "The selfie was blurry — please re-upload a clearer photo.",
  },
} satisfies TemplateEntry;

export default KycRejectedEmail;

const main = { backgroundColor: "#ffffff", fontFamily: "Arial, sans-serif" };
const container = { padding: "24px 28px", maxWidth: "560px" };
const h1 = { fontSize: "22px", fontWeight: "bold" as const, color: "#0a3d2c", margin: "0 0 20px" };
const text = { fontSize: "14px", color: "#334155", lineHeight: "1.6", margin: "0 0 16px" };
const noteBox = {
  backgroundColor: "#fdf6e3",
  border: "1px solid #e6d8a8",
  borderRadius: "8px",
  padding: "14px 16px",
  margin: "8px 0 20px",
};
const noteLabel = {
  fontSize: "10px",
  letterSpacing: "0.12em",
  textTransform: "uppercase" as const,
  color: "#8a6d1a",
  margin: "0 0 6px",
  fontWeight: "700" as const,
};
const noteText = { fontSize: "14px", color: "#4b3a0c", margin: 0, lineHeight: "1.5" };
const button = {
  backgroundColor: "#0a3d2c",
  color: "#fbf7ee",
  fontSize: "14px",
  borderRadius: "8px",
  padding: "12px 22px",
  textDecoration: "none",
  fontWeight: "600" as const,
};
const hr = { borderColor: "#e2e8f0", margin: "20px 0" };
const footer = { fontSize: "12px", color: "#94a3b8", margin: "12px 0 0" };
