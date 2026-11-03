import { useState } from "react";
import {
  getGetEventQueryKey, getGetTeamAttendanceQueryKey, getGetTeamSummaryQueryKey,
  getListPastEventsQueryKey, getListUpcomingEventsQueryKey, useSetRsvp,
} from "@workspace/api-client-react";
import type { RsvpRosterPlayer } from "@workspace/api-client-react";
import { queryClient } from "@/lib/queryClient";

type Status = "going" | "out" | "maybe";
const choices: { status: Status; label: string }[] = [
  { status: "going", label: "Going" },
  { status: "out", label: "Not going" },
  { status: "maybe", label: "Maybe" },
];

export function RsvpCorrection({ eventId, teamId, players, disabled }: {
  eventId: number;
  teamId: number;
  players: RsvpRosterPlayer[];
  disabled: boolean;
}) {
  const setRsvp = useSetRsvp();
  const [pendingPersonId, setPendingPersonId] = useState<number | null>(null);
  const [errors, setErrors] = useState<Record<number, string>>({});

  const update = (personId: number, status: Status) => {
    if (disabled || pendingPersonId != null) return;
    setPendingPersonId(personId);
    setErrors((current) => ({ ...current, [personId]: "" }));
    setRsvp.mutate({
      eventId,
      data: { status, onBehalfOfPersonId: personId, reason: null },
    }, {
      onSuccess: async () => {
        await Promise.all([
          queryClient.invalidateQueries({ queryKey: getGetEventQueryKey(eventId) }),
          queryClient.invalidateQueries({ queryKey: getListPastEventsQueryKey() }),
          queryClient.invalidateQueries({ queryKey: getListUpcomingEventsQueryKey() }),
          queryClient.invalidateQueries({ queryKey: getGetTeamAttendanceQueryKey(teamId) }),
          queryClient.invalidateQueries({ queryKey: getGetTeamSummaryQueryKey(teamId) }),
        ]);
        setPendingPersonId(null);
      },
      onError: (error) => {
        setErrors((current) => ({
          ...current,
          [personId]: error instanceof Error ? error.message : "Could not save this response. Try again.",
        }));
        setPendingPersonId(null);
      },
    });
  };

  if (!players.length) return null;
  return (
    <section className="rounded-2xl border bg-card p-4 shadow-sm" aria-labelledby="rsvp-correction-heading">
      <div className="mb-3">
        <h3 id="rsvp-correction-heading" className="font-display font-bold">Correct player responses</h3>
        <p className="mt-0.5 text-xs text-muted-foreground">Updates are saved to the player’s RSVP for this event.</p>
      </div>
      <div className="divide-y">
        {players.map((player) => (
          <div key={player.personId} data-testid={`row-rsvp-correction-${player.personId}`} className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold">{player.fullName}</p>
              <p className="text-xs text-muted-foreground">Current response: {player.status === "going" ? "Going" : player.status === "out" ? "Not going" : player.status === "maybe" ? "Maybe" : "No response"}</p>
              {errors[player.personId] && <p role="alert" className="mt-1 text-xs font-medium text-destructive">{errors[player.personId]}</p>}
            </div>
            <div className="flex gap-1.5">
              {choices.map(({ status, label }) => (
                <button
                  key={status}
                  type="button"
                  data-testid={`button-rsvp-${status}-${player.personId}`}
                  aria-pressed={player.status === status}
                  disabled={disabled || pendingPersonId != null || player.status === status}
                  onClick={() => update(player.personId, status)}
                  className={`min-h-9 rounded-full border px-3 text-xs font-bold transition-colors disabled:cursor-not-allowed disabled:opacity-55 ${
                    player.status === status ? "border-primary/30 bg-primary/10 text-primary" : "bg-background hover:bg-muted"
                  }`}
                >
                  {pendingPersonId === player.personId && player.status !== status ? "Saving…" : label}
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>
      {disabled && <p className="mt-2 text-xs text-muted-foreground">Responses cannot be changed for a cancelled event.</p>}
    </section>
  );
}
