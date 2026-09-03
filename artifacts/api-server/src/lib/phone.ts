export function formatPhoneForCountry(
  value: string,
  countryCode: string,
): string {
  const trimmed = value.trim();
  if (!trimmed || countryCode !== "AU") return trimmed;

  let digits = trimmed.replace(/\D/g, "");
  if (digits.startsWith("61") && digits.length === 11) {
    digits = `0${digits.slice(2)}`;
  }

  if (digits.length !== 10 || !digits.startsWith("0")) return trimmed;
  if (digits.startsWith("04")) {
    return `${digits.slice(0, 4)} ${digits.slice(4, 7)} ${digits.slice(7)}`;
  }
  return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)} ${digits.slice(6)}`;
}
