import { describe, expect, it } from "vitest";
import {
  resolveClerkPublishableKey as resolveServerKey,
  isNahreoProductionClerkKey as isServerProductionKey,
} from "../src/lib/clerk-key";
import {
  resolveClerkPublishableKey as resolveBrowserKey,
  isNahreoProductionClerkKey as isBrowserProductionKey,
} from "../../clubhub/src/lib/clerk-key";

const keyFor = (prefix: string, host: string) =>
  `${prefix}${Buffer.from(`${host}$`).toString("base64").replace(/=+$/, "")}`;
const productionKey = keyFor("pk_live_", "clerk.nahreo.com");
const developmentKey = keyFor("pk_test_", "example.clerk.accounts.dev");

describe.each([
  ["browser", resolveBrowserKey, isBrowserProductionKey],
  ["API", resolveServerKey, isServerProductionKey],
] as const)("%s Clerk key selection", (_name, resolveKey, isProductionKey) => {
  it.each([
    "app.nahreo.com",
    "clubhub-production-162a.up.railway.app",
    "clubhub.gameinsights.com.au",
  ])("uses the configured external production key on %s", (host) => {
    expect(resolveKey(host, productionKey)).toBe(productionKey);
    expect(isProductionKey(productionKey)).toBe(true);
  });

  it("retains the existing development key unchanged", () => {
    expect(resolveKey("preview.replit.dev", developmentKey)).toBe(developmentKey);
    expect(isProductionKey(developmentKey)).toBe(false);
  });

  it("keeps managed host resolution for other production tenants", () => {
    const otherKey = keyFor("pk_live_", "clerk.other.example");
    expect(resolveKey("managed.example", otherKey))
      .toBe(keyFor("pk_live_", "clerk.managed.example"));
    expect(isProductionKey(otherKey)).toBe(false);
    expect(isProductionKey(undefined)).toBe(false);
  });
});
