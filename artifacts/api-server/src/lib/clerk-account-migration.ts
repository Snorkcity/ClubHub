import { isNahreoProductionClerkKey } from "./clerk-key";

/**
 * Temporary, operator-controlled bridge between the old development tenant
 * and Nahreo's external production tenant. Never enable general email-based
 * replacement of an existing login.
 *
 * The source IDs must be audited before enabling this, and removed after the
 * migration window. A migrated account no longer has an allowlisted source ID.
 */
export function mayTransferLegacyClerkAccount(sourceId: string): boolean {
  const configured = process.env.CLERK_LEGACY_USER_IDS;
  if (!configured) return false;

  const key = process.env.CLERK_PUBLISHABLE_KEY ?? "";
  if (!isNahreoProductionClerkKey(key)) return false;

  const ids = configured.split(",").map((id) => id.trim());
  const expires = Date.parse(process.env.CLERK_ACCOUNT_MIGRATION_UNTIL ?? "");
  if (
    ids.length > 100 ||
    ids.some((id) => !/^user_[A-Za-z0-9]+$/.test(id)) ||
    !Number.isFinite(expires)
  ) {
    throw new Error("Invalid temporary Clerk account migration configuration");
  }
  return expires > Date.now() && ids.includes(sourceId);
}
