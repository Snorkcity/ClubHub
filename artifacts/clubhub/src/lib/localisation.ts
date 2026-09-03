export const COUNTRIES = [
  { code: "AU", name: "Australia" },
  { code: "NZ", name: "New Zealand" },
  { code: "GB", name: "United Kingdom" },
  { code: "US", name: "United States" },
  { code: "CA", name: "Canada" },
] as const;

export type CountryCode = (typeof COUNTRIES)[number]["code"];

export function phonePlaceholder(countryCode: string): string {
  switch (countryCode) {
    case "NZ":
      return "021 123 4567";
    case "GB":
      return "07123 456789";
    case "US":
    case "CA":
      return "(555) 123-4567";
    default:
      return "0412 345 678";
  }
}

export function usesColour(countryCode: string): boolean {
  return ["AU", "NZ", "GB", "CA"].includes(countryCode);
}