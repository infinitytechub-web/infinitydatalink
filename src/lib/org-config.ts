// Multi-country configuration. Swap presets via setOrgConfig("ghana"|"international").
export type OrgConfig = {
  id: string;
  name: string;
  currency: { code: string; symbol: string; locale: string };
  nationalId: { label: string; placeholder: string; pattern: RegExp };
  regions: string[];
  momoProviders: string[];
};

export const ORG_PRESETS: Record<string, OrgConfig> = {
  ghana: {
    id: "ghana",
    name: "Ghana",
    currency: { code: "GHS", symbol: "GH₵", locale: "en-GH" },
    nationalId: {
      label: "Ghana Card Number",
      placeholder: "GHA-XXXXXXXXXX",
      pattern: /^GHA-\d{10}$/,
    },

    regions: [
      "Ahafo",
      "Ashanti",
      "Bono",
      "Bono East",
      "Central",
      "Eastern",
      "Greater Accra",
      "North East",
      "Northern",
      "Oti",
      "Savannah",
      "Upper East",
      "Upper West",
      "Volta",
      "Western",
      "Western North",
    ],
    momoProviders: ["MTN Mobile Money", "Vodafone Cash", "AirtelTigo Money"],
  },
  international: {
    id: "international",
    name: "International",
    currency: { code: "USD", symbol: "$", locale: "en-US" },
    nationalId: {
      label: "National ID Number",
      placeholder: "Enter national ID",
      pattern: /^.{4,32}$/,
    },
    regions: [],
    momoProviders: [],
  },
};

const KEY = "iw:org-config";

export function getOrgConfig(): OrgConfig {
  if (typeof window === "undefined") return ORG_PRESETS.ghana;
  const stored = window.localStorage.getItem(KEY);
  return (stored && ORG_PRESETS[stored]) || ORG_PRESETS.ghana;
}

export function setOrgConfig(id: keyof typeof ORG_PRESETS) {
  window.localStorage.setItem(KEY, id);
}

export function formatMoney(amount: number, cfg: OrgConfig = getOrgConfig()) {
  const formatted = new Intl.NumberFormat(cfg.currency.locale, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Math.abs(amount));
  const sign = amount < 0 ? "-" : "";
  return `${sign}${cfg.currency.symbol} ${formatted}`;
}
