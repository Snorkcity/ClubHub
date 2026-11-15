import { useState } from "react";
import { BellRing } from "lucide-react";
import {
  getGetEventQueryKey, useSendEventReminders, type EventAwaitingResponse,
} from "@workspace/api-client-react";
import { queryClient } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";

export function EventReminderDialog({ eventId, players }: {
  eventId: number;
  players: EventAwaitingResponse[];
}) {
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<number[]>([]);
  const [error, setError] = useState("");
  const send = useSendEventReminders();
  const { toast } = useToast();
  const eligibleIds = new Set(players.map((p) => p.personId));
  // A live response removes a player even while this dialog is open.
  const targets = selected.filter((id) => eligibleIds.has(id));
  const sorted = [...players].sort((a, b) => a.fullName.localeCompare(b.fullName));

  function submit() {
    if (!targets.length || send.isPending) return;
    setError("");
    send.mutate({ eventId, data: { personIds: targets } }, {
      onSuccess: ({ sentCount, skippedCount }) => {
        setOpen(false);
        queryClient.invalidateQueries({ queryKey: getGetEventQueryKey(eventId) });
        toast({
          title: sentCount ? `Reminder sent to ${sentCount} player${sentCount === 1 ? "" : "s"}` : "No new reminders sent",
          description: skippedCount
            ? `${skippedCount} skipped: already replied or reminded in the last 10 minutes.`
            : "Saved in Notifications. Phone alerts appear where push is enabled.",
        });
      },
      onError: (err) => {
        setError(err instanceof Error ? err.message : "Could not send reminders. Please try again.");
        queryClient.invalidateQueries({ queryKey: getGetEventQueryKey(eventId) });
      },
    });
  }

  return (
    <>
      <Button type="button" size="sm" variant="outline"
        onClick={() => { setSelected(sorted.map((p) => p.personId)); setError(""); setOpen(true); }}>
        <BellRing className="h-4 w-4 mr-1.5" />Send reminder
      </Button>
      <Dialog open={open} onOpenChange={(value) => { if (!send.isPending) setOpen(value); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Remind unanswered players</DialogTitle>
            <DialogDescription>
              Untick anyone who does not need a reminder, such as injured or away players.
              Players who have replied will not be notified.
            </DialogDescription>
          </DialogHeader>
          <div className="flex items-center justify-between text-xs">
            <span className="text-muted-foreground" aria-live="polite">{targets.length} selected</span>
            <button type="button" className="font-semibold text-primary py-2"
              disabled={send.isPending}
              onClick={() => setSelected(targets.length === players.length ? [] : players.map((p) => p.personId))}>
              {targets.length === players.length ? "Clear selection" : "Select all"}
            </button>
          </div>
          <div className="max-h-[45dvh] overflow-y-auto divide-y rounded-xl border">
            {sorted.map((player) => (
              <label key={player.personId} className="flex items-center gap-3 px-3 py-3 cursor-pointer">
                <input type="checkbox" className="h-4 w-4 shrink-0 accent-primary"
                  checked={targets.includes(player.personId)} disabled={send.isPending}
                  onChange={(e) => setSelected((ids) => e.target.checked
                    ? [...new Set([...ids, player.personId])]
                    : ids.filter((id) => id !== player.personId))} />
                <span className="text-sm font-medium break-words min-w-0">{player.fullName}</span>
              </label>
            ))}
            {!players.length && <p className="p-3 text-sm text-muted-foreground">Everyone has now replied.</p>}
          </div>
          <p className="text-xs text-muted-foreground">
            Sends an in-app notification and a phone alert where push is enabled.
            Repeat reminders are limited to once per player every 10 minutes.
          </p>
          {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" disabled={send.isPending} onClick={() => setOpen(false)}>Cancel</Button>
            <Button type="button" disabled={!targets.length || send.isPending} onClick={submit}>
              {send.isPending ? "Sending…" : `Send reminder${targets.length === 1 ? "" : "s"} (${targets.length})`}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
