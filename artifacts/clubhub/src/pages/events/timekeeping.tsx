import { useEffect, useMemo, useState } from "react";
import { useParams, Link } from "wouter";
import { ArrowLeft, Play, Square, Timer, UserPlus, Users } from "lucide-react";
import {
  useGetEvent,
  getGetEventQueryKey,
  useGetTimekeeping,
  getGetTimekeepingQueryKey,
  useStartPeriod,
  useEndPeriod,
  useTogglePlayerOnPitch,
  useSetRsvp,
  type TimekeepingState,
} from "@workspace/api-client-react";
import { queryClient } from "@/lib/queryClient";

import { LoadingScreen, ErrorState, EmptyState } from "@/components/ui/states";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";

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

/** Big countdown (or count-up when no planned length) for the running half. */
function RunningClock({ state }: { state: TimekeepingState }) {
  const running = state.periods.find((p) => !p.endedAt);
  const [, tick] = useState(0);
  useEffect(() => {
    if (!running) return;
    const id = setInterval(() => tick((n) => n + 1), 1000);
    return () => clearInterval(id);
  }, [running?.startedAt]);

  if (!running) return null;
  const elapsed = Math.max(
    0,
    Math.floor((Date.now() - new Date(running.startedAt).getTime()) / 1000),
  );
  const planned = running.plannedMinutes ?? null;
  if (planned == null) {
    return (
      <div className="text-4xl font-display font-black tabular-nums">
        {fmtClock(elapsed)}
      </div>
    );
  }
  const remaining = planned * 60 - elapsed;
  return (
    <div className="flex items-baseline gap-2">
      <div
        className={`text-4xl font-display font-black tabular-nums ${
          remaining <= 0 ? "text-red-600" : ""
        }`}
      >
        {remaining >= 0 ? fmtClock(remaining) : `+${fmtClock(-remaining)}`}
      </div>
      <span className="text-xs font-semibold text-muted-foreground">
        {remaining >= 0 ? `left of ${planned} min` : "over time"}
      </span>
    </div>
  );
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
  const setRsvp = useSetRsvp({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getGetTimekeepingQueryKey(eventId) });
        queryClient.invalidateQueries({ queryKey: getGetEventQueryKey(eventId) });
      },
    },
  });

  // "How many minutes in the half?" prompt
  const [askMinutes, setAskMinutes] = useState(false);
  const [minutes, setMinutes] = useState("25");
  const lastPlanned = useMemo(
    () =>
      state?.periods
        ?.slice()
        .reverse()
        .find((p) => p.plannedMinutes != null)?.plannedMinutes ?? null,
    [state?.periods],
  );

  if (isLoading) return <LoadingScreen message="Loading game time..." />;
  if (error || !state) return <ErrorState onRetry={() => refetch()} />;

  const busy = startPeriod.isPending || endPeriod.isPending;
  const onCount = state.players.filter((p) => p.onPitch).length;

  // Coaches pick from the players who are actually Going. Everyone else
  // ("Not going" or no reply) sits in a second list with a "Mark going" action.
  const going = state.players.filter((p) => p.rsvpStatus === "going");
  const notGoing = state.players.filter((p) => p.rsvpStatus !== "going");

  const openStartDialog = () => {
    setMinutes(String(lastPlanned ?? 25));
    setAskMinutes(true);
  };
  const confirmStart = () => {
    const n = parseInt(minutes, 10);
    startPeriod.mutate({
      eventId,
      data: Number.isFinite(n) && n >= 1 && n <= 120 ? { plannedMinutes: n } : {},
    });
    setAskMinutes(false);
  };

  const playerRow = (p: (typeof state.players)[number], isGoing: boolean) => (
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
          {!isGoing && p.rsvpStatus === "out" && (
            <Badge variant="outline" className="text-[10px] text-red-600 border-red-200 bg-red-50">
              Not going
            </Badge>
          )}
          {!isGoing && p.rsvpStatus !== "out" && (
            <Badge variant="outline" className="text-[10px] text-muted-foreground">
              No reply
            </Badge>
          )}
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
      {isGoing ? (
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
      ) : (
        <Button
          onClick={() =>
            setRsvp.mutate({
              eventId,
              data: { status: "going", onBehalfOfPersonId: p.person.id },
            })
          }
          disabled={setRsvp.isPending}
          variant="outline"
          className="rounded-2xl h-12 font-bold shrink-0 text-green-700 border-green-300 hover:bg-green-50"
        >
          <UserPlus className="h-4 w-4 mr-1.5" />
          Mark going
        </Button>
      )}
    </div>
  );

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
              {state.clockRunning && (
                <div className="mt-2">
                  <RunningClock state={state} />
                </div>
              )}
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
                onClick={openStartDialog}
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

        {/* Players who are Going */}
        <div className="bg-card border rounded-3xl overflow-hidden shadow-sm divide-y">
          {going.map((p) => playerRow(p, true))}
          {going.length === 0 && (
            <EmptyState
              title="No players marked Going"
              message="Players who RSVP Going show up here. Use Mark going below for anyone who hasn't responded in the app."
              icon={Users}
            />
          )}
        </div>

        {/* Everyone else — coach can mark them Going */}
        {notGoing.length > 0 && (
          <div className="space-y-2">
            <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider pl-1">
              Not marked going
            </h2>
            <div className="bg-card border rounded-3xl overflow-hidden shadow-sm divide-y">
              {notGoing.map((p) => playerRow(p, false))}
            </div>
          </div>
        )}
      </div>

      {/* Half length prompt */}
      <Dialog open={askMinutes} onOpenChange={setAskMinutes}>
        <DialogContent className="max-w-xs rounded-2xl top-24 translate-y-0 sm:top-[50%] sm:translate-y-[-50%]">
          <DialogHeader>
            <DialogTitle className="font-display">
              How many minutes in the half?
            </DialogTitle>
          </DialogHeader>
          <Input
            type="number"
            inputMode="numeric"
            min={1}
            max={120}
            value={minutes}
            onChange={(e) => setMinutes(e.target.value)}
            className="rounded-xl h-12 text-lg font-bold text-center"
            autoFocus
          />
          <Button
            onClick={confirmStart}
            disabled={startPeriod.isPending}
            className="w-full rounded-xl h-12 font-bold bg-green-600 hover:bg-green-700"
          >
            <Play className="h-5 w-5 mr-2" />
            Start half
          </Button>
        </DialogContent>
      </Dialog>
    </div>
  );
}
