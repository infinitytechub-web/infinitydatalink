/**
 * Ghana administrative location reference data.
 *
 * All 16 regions with their metropolitan / municipal / district assemblies
 * (MMDAs). Used by registration biodata, Profile & KYC, admin review screens
 * and reports so every module shares one source of truth.
 */

export type GhanaRegion = {
  code: string;
  name: string;
  capital: string;
  districts: string[];
};

export const GHANA_REGIONS: GhanaRegion[] = [
  {
    code: "greater_accra",
    name: "Greater Accra",
    capital: "Accra",
    districts: [
      "Ablekuma Central Municipal",
      "Ablekuma North Municipal",
      "Ablekuma West Municipal",
      "Accra Metropolitan",
      "Ada East",
      "Ada West",
      "Adenta Municipal",
      "Ashaiman Municipal",
      "Ayawaso Central Municipal",
      "Ayawaso East Municipal",
      "Ayawaso North Municipal",
      "Ayawaso West Municipal",
      "Ga Central Municipal",
      "Ga East Municipal",
      "Ga North Municipal",
      "Ga South Municipal",
      "Ga West Municipal",
      "Korle Klottey Municipal",
      "Kpone Katamanso Municipal",
      "Krowor Municipal",
      "La Dade Kotopon Municipal",
      "La Nkwantanang Madina Municipal",
      "Ledzokuku Municipal",
      "Ningo Prampram",
      "Okaikwei North Municipal",
      "Shai Osudoku",
      "Tema Metropolitan",
      "Tema West Municipal",
      "Weija Gbawe Municipal",
    ],
  },
  {
    code: "ashanti",
    name: "Ashanti",
    capital: "Kumasi",
    districts: [
      "Adansi Asokwa",
      "Adansi North",
      "Adansi South",
      "Afigya Kwabre North",
      "Afigya Kwabre South",
      "Ahafo Ano North Municipal",
      "Ahafo Ano South East",
      "Ahafo Ano South West",
      "Akrofuom",
      "Amansie Central",
      "Amansie South",
      "Amansie West",
      "Asante Akim Central Municipal",
      "Asante Akim North",
      "Asante Akim South Municipal",
      "Asokore Mampong Municipal",
      "Asokwa Municipal",
      "Atwima Kwanwoma",
      "Atwima Mponua",
      "Atwima Nwabiagya Municipal",
      "Atwima Nwabiagya North",
      "Bekwai Municipal",
      "Bosome Freho",
      "Bosomtwe",
      "Ejisu Municipal",
      "Ejura Sekyedumase Municipal",
      "Juaben Municipal",
      "Kumasi Metropolitan",
      "Kwabre East Municipal",
      "Kwadaso Municipal",
      "Mampong Municipal",
      "Obuasi East",
      "Obuasi Municipal",
      "Offinso Municipal",
      "Offinso North",
      "Oforikrom Municipal",
      "Old Tafo Municipal",
      "Sekyere Afram Plains",
      "Sekyere Central",
      "Sekyere East",
      "Sekyere Kumawu",
      "Sekyere South",
ությ    ].filter(Boolean) as string[],
  },
];
