import { useParams, Link } from "wouter";
import { ArrowLeft, Play, Square, Timer } from "lucide-react";
import {
  useGetEvent,
  getGetEventQueryKey,
  useGetTimekeeping,
  getGetTimekeepingQueryKey,
  useStartPeriod,
  useEndPeriod,
  useTogglePlayerOnPitch,
  type TimekeepingState,
} from "@workspace/api-client-react";
import { queryClient } from "@/lib/queryClient";

import { LoadingScreen, ErrorState, EmptyState } from "@/components/ui/states";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Users } from "lucide-react";

function fmtClock(totalSeconds: number): string {
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

function periodLabel(state: TimekeepingState): string {
  if (state.clockRunning)
    return state.currentPeriodNumber === 1
      ? "1st half running"
      : state.currentPeriodNumber === 2
        ? "2nd half running"
        : `Period ${state.currentPeriodNumber} running`;
  if (state.periodsPlayed === 0) return "Not started";
  if (state.periodsPlayed === 1) return "Half-time";
  return "Full-time";
}

export default function EventTimekeeping() {
  const params = useParams();
  const eventId = Number(params.eventId);

  const { data: eventData } = useGetEvent(eventId, {
    query: { enabled: !!eventId, queryKey: getGetEventQueryKey(eventId) },
  });

  const { data: state, isLoading, error, refetch } = useGetTimekeeping(eventId, {
    query: {
      enabled: !!eventId,
      queryKey: getGetTimekeepingQueryKey(eventId),
      refetchInterval: 5000,
    },
  });

  const applyState = (next: TimekeepingState) =>
    queryClient.setQueryData(getGetTimekeepingQueryKey(eventId), next);

  const startPeriod = useStartPeriod({ mutation: { onSuccess: applyState } });
  const endPeriod = useEndPeriod({ mutation: { onSuccess: applyState } });
  const toggle = useTogglePlayerOnPitch({ mutation: { onSuccess: applyState } });

  if (isLoading) return <LoadingScreen message="Loading game time..." />;
  if (error || !state) return <ErrorState onRetry={() => refetch()} />;

  const busy = startPeriod.isPending || endPeriod.isPending;
  const onCount = state.players.filter((p) => p.onPitch).length;

  return (
    <div className="flex-1 overflow-y-auto bg-muted/10">
      <div className="container mx-auto p-4 md:p-8 lg:max-w-3xl space-y-4">
        <Link
          href={`/events/${eventId}`}
          className="inline-flex items-center text-sm font-semibold text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="h-4 w-4 mr-1" /> Back to event
        </Link>

        {/* Clock card */}
        <div className="bg-card border rounded-3xl p-5 shadow-sm sticky top-0 z-10">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <h1 className="font-display font-bold text-xl truncate">
                {eventData?.event.title ?? "Game time"}
              </h1>
              <div className="flex items-center gap-2 mt-1">
                <Badge
                  variant="outline"
                  className={
                    state.clockRunning
                      ? "bg-green-100 text-green-700 border-green-200 font-bold"
                      : "font-semibold"
                  }
                >
                  <Timer className="h-3.5 w-3.5 mr-1" />
                  {periodLabel(state)}
                </Badge>
                <span className="text-xs text-muted-foreground font-semibold">
                  {onCount} on pitch
                </span>
              </div>
            </div>
            {state.clockRunning ? (
              <Button
                onClick={() => endPeriod.mutate({ eventId })}
                disabled={busy}
                variant="destructive"
                className="rounded-2xl h-14 px-5 font-bold shrink-0"
              >
                <Square className="h-5 w-5 mr-2" />
                End half
              </Button>
            ) : (
              <Button
                onClick={() => startPeriod.mutate({ eventId })}
                disabled={busy}
                className="rounded-2xl h-14 px-5 font-bold bg-green-600 hover:bg-green-700 shrink-0"
              >
                <Play className="h-5 w-5 mr-2" />
                {state.periodsPlayed === 0 ? "Start half" : "Start next half"}
              </Button>
            )}
          </div>
          {!state.clockRunning && state.periodsPlayed === 0 && (
            <p className="text-xs text-muted-foreground mt-3">
              Toggle your starting line-up ON, then hit Start half — minutes only
              count while a half is running.
            </p>
          )}
        </div>

        {/* Players */}
        <div className="bg-card border rounded-3xl overflow-hidden shadow-sm divide-y">
          {state.players.map((p) => (
            <div key={p.person.id} className="flex items-center gap-3 p-3">
              <Avatar className="h-11 w-11 border shrink-0">
                <AvatarImage src={p.person.avatarUrl || undefined} />
                <AvatarFallback>{p.person.firstName?.charAt(0)}</AvatarFallback>
              </Avatar>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  {p.jerseyNumber != null && (
                    <span className="text-xs font-bold text-muted-foreground tabular-nums">
                      #{p.jerseyNumber}
                    </span>
                  )}
                  <span className="font-semibold text-sm truncate">
                    {p.person.fullName}
                  </span>
                </div>
                <span
                  className={`text-sm tabular-nums font-bold ${
                    p.onPitch ? "text-green-600" : "text-muted-foreground"
                  }`}
                >
                  {fmtClock(p.secondsPlayed)}
                  <span className="font-normal text-xs text-muted-foreground"> min</span>
                </span>
              </div>
              <Button
                onClick={() => toggle.mutate({ eventId, userId: p.person.id })}
                disabled={toggle.isPending}
                variant={p.onPitch ? "default" : "outline"}
                className={`rounded-2xl h-12 w-20 font-bold shrink-0 ${
                  p.onPitch ? "bg-green-600 hover:bg-green-700" : ""
                }`}
              >
                {p.onPitch ? "ON" : "OFF"}
              </Button>
            </div>
          ))}
          {state.players.length === 0 && (
            <EmptyState
              title="No players on the roster"
              message="Add players to this team to track their minutes."
              icon={Users}
            />
          )}
        </div>
      </div>
    </div>
  );
}
