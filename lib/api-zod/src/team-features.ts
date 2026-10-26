/** Team categories, not players' birthdays, determine these product modules. */
export function normalizeTeamAgeGroup(value: string): string | null {
  const text = value.trim().toLowerCase();
  if (/^(seniors?|adults?|open(?: age)?|masters?|veterans?)$/.test(text)) return "Seniors";
  const match = /^(?:u|under)[\s-]*(\d{1,2})(?:['’]?s)?$/.exec(text)
    ?? /^(\d{1,2})['’]?s$/.exec(text);
  if (!match) return null;
  const age = Number(match[1]);
  return age >= 1 && age <= 99 ? `U${age}` : null;
}

export function teamFeatures(ageGroup: string | null | undefined) {
  const normalized = normalizeTeamAgeGroup(ageGroup ?? "");
  const age = normalized?.startsWith("U") ? Number(normalized.slice(1)) : null;
  const monitoring = normalized === "Seniors" || (age !== null && age >= 14);
  return {
    classified: normalized !== null,
    monitoring,
    learningPreferences: monitoring,
    timekeeping: age !== null && age <= 17,
  };
}

export const TEAM_AGE_GROUP_OPTIONS = [
  ...Array.from({ length: 20 }, (_, i) => `U${i + 1}`),
  "U23",
  "Seniors",
];
