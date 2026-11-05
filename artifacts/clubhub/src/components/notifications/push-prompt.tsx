import { useEffect, useState } from "react";
import { Bell, Loader2 } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import {
  getGetMeQueryKey, getGetPushConfigQueryKey, useGetPushConfig, useSavePushSubscription,
} from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { getSubscription, usePushSupport } from "@/lib/push";
import {
  dismissPushPrompt, enableDevicePush, hasSavedPushRegistration, isPushPromptDismissed,
} from "@/lib/push-enrollment";

const basePath = import.meta.env.BASE_URL.replace(/\/$/, "");

export function PushNotificationPrompt({
  personId, accountEnabled,
}: { personId: number; accountEnabled: boolean }) {
  const support = usePushSupport();
  const { data: config } = useGetPushConfig({ query: { queryKey: getGetPushConfigQueryKey() } });
  const save = useSavePushSubscription();
  const client = useQueryClient();
  const { toast } = useToast();
  const installFirst = support.isIos && !support.isStandalone;
  const mode = installFirst ? "install" : "enable";
  const [dismissed, setDismissed] = useState(() => isPushPromptDismissed(personId, mode));
  const [checking, setChecking] = useState(true);
  const [connected, setConnected] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    setChecking(true);
    if (installFirst || !support.isSupported) {
      setChecking(false);
      return;
    }
    void getSubscription(basePath).then((subscription) => {
      if (!active) return;
      setConnected(Boolean(subscription && hasSavedPushRegistration(
        personId, subscription.endpoint, accountEnabled, basePath,
      )));
      setChecking(false);
    }, () => {
      if (!active) return;
      setError("We couldn't check this device's notification setup. You can try enabling it below.");
      setChecking(false);
    });
    return () => { active = false; };
  }, [personId, accountEnabled, installFirst, support.isSupported]);

  async function enable() {
    setBusy(true);
    setError("");
    try {
      await enableDevicePush(personId, config!.publicKey!, basePath, (payload) =>
        save.mutateAsync({ data: payload }));
      client.setQueryData(getGetMeQueryKey(), (old: any) =>
        old ? { ...old, pushNotificationsEnabled: true } : old);
      setConnected(true);
      toast({ title: "Notifications enabled on this device" });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Notifications weren't enabled. Please try again.");
    } finally {
      if (typeof Notification !== "undefined") support.setPermission(Notification.permission);
      setBusy(false);
    }
  }

  // An explicit browser block is not an invitation to repeatedly ask for permission.
  if (!config?.enabled || !config.publicKey || dismissed || connected || checking ||
    (!installFirst && !support.isSupported) ||
    (!installFirst && support.permission === "denied" && !error)) return null;

  return (
    <section aria-label="Set up team notifications" data-testid="push-notification-prompt"
      className="rounded-2xl border border-primary/20 bg-primary/5 p-3 md:p-4">
      <div className="flex items-start gap-2.5">
        <Bell aria-hidden="true" className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
        <div className="min-w-0 flex-1">
          <h2 className="text-sm font-semibold">Keep up with your team</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {installFirst
              ? "On iPhone, open Nahreo in Safari, tap Share → Add to Home Screen, then open the Home Screen app to enable notifications."
              : "Enable notifications for team news, messages and schedule updates. Your phone will ask for permission if needed."}
          </p>
          {error && <p role="alert" className="mt-2 text-sm text-destructive">{error}</p>}
          <div className="mt-2 flex flex-wrap items-center gap-2">
            {!installFirst && support.permission !== "denied" && (
              <Button size="sm" className="min-h-11 rounded-xl" disabled={busy} onClick={() => void enable()}>
                {busy && <Loader2 aria-hidden="true" className="mr-2 h-4 w-4 animate-spin" />}
                {busy ? "Enabling…" : "Enable notifications"}
              </Button>
            )}
            <Button size="sm" variant="ghost" className="min-h-11 rounded-xl" disabled={busy}
              onClick={() => { dismissPushPrompt(personId, mode); setDismissed(true); }}>
              Not now
            </Button>
          </div>
        </div>
      </div>
    </section>
  );
}
