import { useState } from "react";
import {
  useSetRsvp, getGetEventQueryKey, getListUpcomingEventsQueryKey,
  getGetTeamSummaryQueryKey, type Person, type Rsvp,
} from "@workspace/api-client-react";
import { queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

interface GuardianRsvpProps {
  eventId: number;
  teamId: number;
  players: Person[];
  rsvps: Rsvp[];
  enabled: boolean;
}

export function GuardianRsvp({ eventId, teamId, players, rsvps, enabled }: GuardianRsvpProps) {
  if (!enabled || !players.length) return null;
  return (
    <section aria-label="RSVP for your children" className="space-y-3">
      <div>
        <h2 className="text-xl font-display font-bold">RSVP for your children</h2>
        <p className="text-sm text-muted-foreground">Respond separately for each child on this team.</p>
      </div>
      {players.map(player => (
        <ChildRsvp key={`${eventId}-${player.id}`} eventId={eventId} teamId={teamId}
          player={player} rsvp={rsvps.find(response => response.person.id === player.id)} />
      ))}
    </section>
  );
}

function ChildRsvp({ eventId, teamId, player, rsvp }: {
  eventId: number; teamId: number; player: Person; rsvp?: Rsvp;
}) {
  const [editingAbsence, setEditingAbsence] = useState(false);
  const [reason, setReason] = useState("");
  const { toast } = useToast();
  const mutation = useSetRsvp({
    mutation: {
      onSuccess: async () => {
        await Promise.all([
          queryClient.invalidateQueries({ queryKey: getGetEventQueryKey(eventId) }),
          queryClient.invalidateQueries({ queryKey: getListUpcomingEventsQueryKey() }),
          queryClient.invalidateQueries({ queryKey: getGetTeamSummaryQueryKey(teamId) }),
        ]);
        setEditingAbsence(false);
        toast({ title: `Response saved for ${player.fullName}` });
      },
      onError: () => {
        toast({
          title: "Could not save response",
          description: "Please check the latest response and try again.",
          variant: "destructive",
        });
        // Refresh permissions/cancellation state if it changed while this page
        // was open. Never show a successful response before the server saves it.
        void queryClient.invalidateQueries({ queryKey: getGetEventQueryKey(eventId) });
      },
    },
  });
  const status = rsvp?.status === "going" ? "Going"
    : rsvp?.status === "out" ? "Not going"
    : rsvp?.status === "maybe" ? "Maybe" : "No response yet";
  const reasonId = `guardian-rsvp-reason-${eventId}-${player.id}`;

  function respond(response: "going" | "out") {
    mutation.mutate({
      eventId,
      data: {
        status: response,
        onBehalfOfPersonId: player.id,
        reason: response === "out" ? reason.trim() || null : null,
      },
    });
  }

  return (
    <div className="rounded-2xl border bg-card p-4 shadow-sm space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="font-semibold break-words">{player.fullName}</p>
          <p role="status" className="text-sm text-muted-foreground">{status}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button type="button" size="sm" variant={rsvp?.status === "going" ? "default" : "outline"}
            disabled={mutation.isPending} aria-label={`Mark ${player.fullName} as going`}
            onClick={() => respond("going")}>Going</Button>
          <Button type="button" size="sm" variant={rsvp?.status === "out" ? "default" : "outline"}
            disabled={mutation.isPending} aria-label={`Mark ${player.fullName} as not going`}
            onClick={() => { setReason(rsvp?.reason ?? ""); setEditingAbsence(true); }}>Not going</Button>
        </div>
      </div>
      {rsvp?.status === "out" && rsvp.reason && !editingAbsence && (
        <p className="text-sm text-muted-foreground whitespace-pre-wrap break-words">{rsvp.reason}</p>
      )}
      {editingAbsence && (
        <form className="space-y-3" onSubmit={event => { event.preventDefault(); respond("out"); }}>
          <label htmlFor={reasonId} className="block text-sm font-medium">Reason for absence (optional)</label>
          <Textarea id={reasonId} autoFocus value={reason} disabled={mutation.isPending}
            onChange={event => setReason(event.target.value)} rows={2} />
          <p className="text-xs text-muted-foreground">
            The player, their guardians, team staff and club admins can see this reason.
          </p>
          <div className="flex flex-wrap gap-2">
            <Button type="submit" size="sm" disabled={mutation.isPending}>
              {mutation.isPending ? "Saving…" : "Save response"}
            </Button>
            <Button type="button" size="sm" variant="outline" disabled={mutation.isPending}
              onClick={() => setEditingAbsence(false)}>Cancel</Button>
          </div>
        </form>
      )}
    </div>
  );
}
