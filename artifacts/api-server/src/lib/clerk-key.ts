import { publishableKeyFromHost } from "@clerk/shared/keys";

/** Preserve the explicitly configured external tenant on Railway/alias hosts. */
export function isNahreoProductionClerkKey(key: string | undefined): boolean {
  if (!key?.startsWith("pk_live_")) return false;
  return Buffer.from(key.slice("pk_live_".length), "base64")
    .toString("utf8") === "clerk.nahreo.com$";
}

export function resolveClerkPublishableKey(host: string, key?: string): string {
  return isNahreoProductionClerkKey(key)
    ? key!
    : publishableKeyFromHost(host, key);
}
