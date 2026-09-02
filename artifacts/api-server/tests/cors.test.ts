import { describe, expect, it } from "vitest";
import {
  isCorsOriginAllowed,
  productionWebOrigins,
} from "../src/lib/cors";

describe("production CORS origins", () => {
  it("allows the Nahreo and compatibility web domains", () => {
    expect(
      isCorsOriginAllowed("https://app.nahreo.com", "production"),
    ).toBe(true);
    expect(
      isCorsOriginAllowed(
        "https://clubhub.gameinsights.com.au",
        "production",
      ),
    ).toBe(true);
  });

  it("allows requests without a browser origin", () => {
    expect(isCorsOriginAllowed(undefined, "production")).toBe(true);
  });

  it("rejects unknown browser origins in production", () => {
    expect(
      isCorsOriginAllowed("https://example.invalid", "production"),
    ).toBe(false);
  });

  it("does not restrict local development origins", () => {
    expect(isCorsOriginAllowed("http://localhost:5173", "development")).toBe(
      true,
    );
  });

  it("keeps the production list intentionally narrow", () => {
    expect([...productionWebOrigins]).toEqual([
      "https://app.nahreo.com",
      "https://clubhub.gameinsights.com.au",
    ]);
  });
});