export const DEMO_REQUEST =
  "After the update, sales employees cannot sign in to the portal: they see a 500 error. This is urgent.";

export const DEMO_SCENARIOS = [
  {
    id: "portal-500",
    title: "Portal login 500",
    text: DEMO_REQUEST,
  },
  {
    id: "vpn-cert",
    title: "VPN certificate",
    text: "Remote VPN users cannot connect after last night's certificate rotation. The tunnel handshake fails before a session starts.",
  },
  {
    id: "invoice-pdf",
    title: "Invoice PDF timeout",
    text: "Finance cannot export invoice PDFs: the billing job times out after 60 seconds and no file is produced.",
  },
  {
    id: "email-delay",
    title: "Email delay",
    text: "Outbound email has been delayed for two hours. Customers are not receiving password-reset messages.",
  },
  {
    id: "sso-mfa",
    title: "SSO MFA loop",
    text: "People are stuck in an SSO MFA loop after the Okta push and never reach the app.",
  },
] as const;

export type DemoScenario = (typeof DEMO_SCENARIOS)[number];

export const REQUEST_MAX_LENGTH = 10_000;

export const WORKFLOW_STEPS = [
  "Request",
  "Evidence",
  "Brief",
  "Human gate",
  "Audit",
] as const;
