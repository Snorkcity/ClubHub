import { describe, expect, it } from "vitest";
import { formatPhoneForCountry } from "../src/lib/phone";

describe("country-aware phone formatting", () => {
  it("formats Australian mobile numbers in national convention", () => {
    expect(formatPhoneForCountry("0412345678", "AU")).toBe("0412 345 678");
    expect(formatPhoneForCountry("+61 412 345 678", "AU")).toBe("0412 345 678");
  });

  it("formats Australian landlines in national convention", () => {
    expect(formatPhoneForCountry("0298765432", "AU")).toBe("(02) 9876 5432");
  });

  it("preserves unfamiliar and non-Australian values", () => {
    expect(formatPhoneForCountry("555-1234", "AU")).toBe("555-1234");
    expect(formatPhoneForCountry("(555) 123-4567", "US")).toBe("(555) 123-4567");
  });
});