import { publishableKeyFromHost } from "@clerk/react/internal";

/** Own-domain Clerk must use its configured key, not Replit's host-derived key. */
export function isNahreoProductionClerkKey(key: string | undefined): boolean {
  if (!key?.startsWith("pk_live_")) return false;
  try {
    return atob(key.slice("pk_live_".length)) === "clerk.nahreo.com$";
  } catch {
    return false;
  }
}

export function resolveClerkPublishableKey(host: string, key?: string): string {
  return isNahreoProductionClerkKey(key)
    ? key!
    : publishableKeyFromHost(host, key);
}
