import { subscribeToPush } from "./push";

export type PushSubscriptionPayload = {
  endpoint: string;
  keys: { p256dh: string; auth: string };
};

type PromptMode = "install" | "enable";
type Registration = { personId: number; endpoint: string; saved: boolean };

// In-memory copies also preserve a choice during navigation when storage is blocked.
const decisions = new Map<string, string | null>();
function read(key: string): string | null {
  if (decisions.has(key)) return decisions.get(key) ?? null;
  try { return window.localStorage.getItem(key); } catch { return null; }
}
function write(key: string, value: string | null) {
  decisions.set(key, value);
  try {
    if (value === null) window.localStorage.removeItem(key);
    else window.localStorage.setItem(key, value);
  } catch { /* The current browser session still remembers this choice. */ }
}
function decisionKey(personId: number, mode: PromptMode) {
  return `nahreo:push-prompt:${personId}:${mode}`;
}
export function isPushPromptDismissed(personId: number, mode: PromptMode) {
  return read(decisionKey(personId, mode)) === "dismissed";
}
export function dismissPushPrompt(personId: number, mode: PromptMode) {
  write(decisionKey(personId, mode), "dismissed");
}
export function clearPushPromptDismissal(personId: number) {
  write(decisionKey(personId, "enable"), null);
}
function registrationKey(basePath: string) {
  return `nahreo:push-registration:${basePath || "/"}`;
}

/** A browser subscription alone is not proof that saving it to Nahreo succeeded. */
export function hasSavedPushRegistration(
  personId: number, endpoint: string, accountEnabled: boolean, basePath = "",
) {
  const receipt = read(registrationKey(basePath));
  if (!receipt) return accountEnabled; // Existing subscriptions predate this prompt.
  try {
    const registration: Registration = JSON.parse(receipt);
    return accountEnabled && registration.personId === personId && registration.endpoint === endpoint && registration.saved;
  } catch { return false; }
}

/** Call only from a user click. Permission must be requested before any other await. */
export async function enableDevicePush(
  personId: number,
  publicKey: string,
  basePath: string,
  save: (payload: PushSubscriptionPayload) => Promise<unknown>,
) {
  if (!publicKey) throw new Error("Push is not configured on the server.");
  if (typeof Notification === "undefined") throw new Error("Notifications are not supported in this browser.");
  const permission = Notification.permission === "default"
    ? await Notification.requestPermission()
    : Notification.permission;
  if (permission !== "granted") {
    throw new Error(permission === "denied"
      ? "Notifications are blocked. Allow notifications for Nahreo in your phone or browser settings, then try again."
      : "Notification permission was not granted. You can try again whenever you're ready.");
  }
  const subscription = await subscribeToPush(publicKey, basePath);
  if (!subscription) throw new Error("This device could not create a push subscription.");
  const json = subscription.toJSON();
  if (!json.endpoint || !json.keys?.p256dh || !json.keys?.auth) {
    throw new Error("The browser returned an incomplete push subscription.");
  }
  const receipt: Registration = { personId, endpoint: json.endpoint, saved: false };
  write(registrationKey(basePath), JSON.stringify(receipt));
  await save({
    endpoint: json.endpoint,
    keys: { p256dh: json.keys.p256dh, auth: json.keys.auth },
  });
  write(registrationKey(basePath), JSON.stringify({ ...receipt, saved: true }));
  clearPushPromptDismissal(personId);
  return subscription;
}
