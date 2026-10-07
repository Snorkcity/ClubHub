import { useState } from "react";
import { format } from "date-fns";
import { Link } from "wouter";
import { CalendarDays, Check, ChevronDown, MapPin, Users, X } from "lucide-react";
import { 
  useListUpcomingEvents, getListUpcomingEventsQueryKey,
  useSetRsvp, getGetEventQueryKey, getGetTeamSummaryQueryKey
} from "@workspace/api-client-react";
import { queryClient } from "@/lib/queryClient";

import { LoadingScreen, ErrorState, EmptyState } from "@/components/ui/states";
import { locationName } from "@/lib/location";
import { NewEventDialog } from "@/components/schedule/new-event-dialog";
import { Button } from "@/components/ui/button";

export default function Schedule() {
  const { data: events, isLoading, error, refetch } = useListUpcomingEvents({ 
    query: { queryKey: getListUpcomingEventsQueryKey() } 
  });

  if (isLoading) return <LoadingScreen message="Loading schedule..." />;
  if (error || !events) return <ErrorState onRetry={() => refetch()} />;

  // Group events by day
  const groupedEvents: Record<string, any[]> = {};
  
  events.forEach((event) => {
    const dateStr = format(new Date(event.startsAt), "yyyy-MM-dd");
    if (!groupedEvents[dateStr]) groupedEvents[dateStr] = [];
    groupedEvents[dateStr].push(event);
  });

  const sortedDays = Object.keys(groupedEvents).sort();

  return (
    <div className="flex-1 overflow-y-auto overflow-x-hidden bg-muted/10">
      {/* Compact sticky header, like Chats — stays put while the list scrolls. */}
      <header className="sticky top-0 z-20 bg-background/95 backdrop-blur border-b">
        <div className="container mx-auto px-4 md:px-8 lg:max-w-4xl h-12 flex items-center justify-between">
          <h1 className="text-xl font-display font-bold tracking-tight">Schedule</h1>
          <NewEventDialog />
        </div>
      </header>
      <div className="container mx-auto p-4 md:p-8 lg:max-w-4xl">
        {events.length === 0 ? (
          <EmptyState 
            title="Your schedule is clear" 
            message="There are no upcoming events for any of your teams right now."
            icon={CalendarDays}
          />
        ) : (
          <div className="space-y-2">
            {sortedDays.map((day) => {
              const dayEvents = groupedEvents[day];

              return (
                <div key={day} className="flex flex-col gap-2 md:gap-3">
                  {dayEvents.map(event => (
                    <ScheduleCard key={event.id} event={event} />
                  ))}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

export const eventTypeColors: Record<string, string> = {
  game: "bg-blue-600 text-white border-transparent",
  training: "bg-emerald-600 text-white border-transparent",
  social: "bg-amber-500 text-white border-transparent",
  other: "bg-slate-600 text-white border-transparent",
};
export const eventTypeBar: Record<string, string> = {
  game: "bg-blue-600",
  training: "bg-emerald-600",
  social: "bg-amber-500",
  other: "bg-slate-600",
};

function ScheduleCard({ event }: { event: any }) {
  const setRsvp = useSetRsvp();
  const [reasonOpen, setReasonOpen] = useState(false);
  const [rsvpChoicesOpen, setRsvpChoicesOpen] = useState(false);
  const [reason, setReason] = useState("");

  const typeColor = eventTypeColors[event.type] || eventTypeColors.other;
  const barColor = eventTypeBar[event.type] || eventTypeBar.other;

  function submitRsvp(status: "going" | "out", reasonText?: string) {
    setRsvp.mutate({
      eventId: event.id,
      data: { status, ...(status === "out" ? { reason: reasonText ?? null } : {}) },
    }, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListUpcomingEventsQueryKey() });
        queryClient.invalidateQueries({ queryKey: getGetEventQueryKey(event.id) });
        queryClient.invalidateQueries({ queryKey: getGetTeamSummaryQueryKey(event.teamId) });
      },
    });
  }

  function handleGoing() {
    setReasonOpen(false);
    setRsvpChoicesOpen(false);
    if (event.myRsvp === "going") return;
    submitRsvp("going");
  }

  function handleNot() {
    // Mark "Not" immediately, then let them optionally add a reason.
    if (event.myRsvp !== "out") submitRsvp("out");
    setReasonOpen(true);
    setRsvpChoicesOpen(false);
  }

  return (
    <div className="bg-card border rounded-2xl px-3.5 py-3 hover:shadow-md transition-shadow group relative overflow-hidden">
      <div className={`absolute top-0 left-0 bottom-0 w-1.5 ${barColor}`} />

      <div className="flex items-center gap-2.5 pl-2">
        {/* The date lives with its event, so separate day headings aren't needed. */}
        <time
          dateTime={format(new Date(event.startsAt), "yyyy-MM-dd")}
          aria-label={format(new Date(event.startsAt), "EEEE, MMMM d")}
          className="w-11 shrink-0 self-stretch min-h-[3.25rem] rounded-xl bg-muted/70 flex flex-col items-center justify-center leading-none"
        >
          <span className="text-[9px] font-bold uppercase tracking-wide text-muted-foreground">
            {format(new Date(event.startsAt), "MMM")}
          </span>
          <span className="mt-0.5 font-display text-lg font-bold text-foreground">
            {format(new Date(event.startsAt), "d")}
          </span>
          <span className="mt-0.5 text-[9px] font-semibold uppercase text-muted-foreground">
            {format(new Date(event.startsAt), "EEE")}
          </span>
        </time>

        {/* Main content */}
        <Link href={`/events/${event.id}`} className="flex-1 min-w-0 py-0.5">
          <div className="flex items-center gap-2">
            <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full border ${typeColor}`}>
              {event.type}
            </span>
            {event.cancelledAt && (
              <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-red-600 text-white">
                Cancelled
              </span>
            )}
          </div>
          <h3 className={`font-bold text-[15px] leading-tight group-hover:text-primary transition-colors truncate mt-0.5 ${event.cancelledAt ? "line-through text-muted-foreground" : ""}`}>
            {event.title}
          </h3>
          <div className="flex flex-wrap items-center gap-x-2.5 text-xs text-muted-foreground mt-1">
            <span className="font-semibold text-foreground/80">{format(new Date(event.startsAt), "h:mm a")}</span>
            {event.location && (
              <span className="flex items-center truncate"><MapPin className="h-3 w-3 mr-1 opacity-70" /> {locationName(event.location)}</span>
            )}
            {event.opponent && (
              <span className="flex items-center"><Users className="h-3 w-3 mr-1 opacity-70" /> vs {event.opponent}</span>
            )}
          </div>
        </Link>

        {/* RSVP: compact status after answering; expand only when changing it. */}
        {!event.cancelledAt && (
        <div className="flex gap-1.5 shrink-0">
          {event.myRsvp && !rsvpChoicesOpen ? (
            <button
              onClick={() => setRsvpChoicesOpen(true)}
              disabled={setRsvp.isPending}
              aria-label={`RSVP: ${event.myRsvp === "going" ? "Going" : "Not going"}. Change response`}
              className={`h-9 px-2.5 rounded-full flex items-center gap-1.5 border text-sm font-bold ${
                event.myRsvp === "going"
                  ? "bg-green-600 text-white border-transparent"
                  : "bg-red-600 text-white border-transparent"
              }`}
            >
              {event.myRsvp === "going" ? <Check className="h-4 w-4" /> : <X className="h-4 w-4" />}
              <ChevronDown className="h-3.5 w-3.5" />
            </button>
          ) : (
          <>
          <button
            onClick={handleGoing}
            disabled={setRsvp.isPending}
            className={`px-3.5 py-1.5 rounded-full text-sm font-bold transition-all border ${
              event.myRsvp === "going"
                ? "bg-green-600 text-white border-transparent shadow-sm"
                : "bg-background text-green-700 border-green-300 hover:bg-green-50"
            }`}
          >
            Going
          </button>
          <button
            onClick={handleNot}
            disabled={setRsvp.isPending}
            className={`px-3.5 py-1.5 rounded-full text-sm font-bold transition-all border ${
              event.myRsvp === "out"
                ? "bg-red-600 text-white border-transparent shadow-sm"
                : "bg-background text-red-700 border-red-300 hover:bg-red-50"
            }`}
          >
            Not
          </button>
          </>
          )}
        </div>
        )}
      </div>

      {/* Reason field, shown when marking Not */}
      {reasonOpen && (
        <div className="mt-3 ml-2 pl-11 pr-1 flex items-center gap-2 animate-in fade-in slide-in-from-top-1 duration-150">
          <input
            autoFocus
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                submitRsvp("out", reason.trim() || undefined);
                setReasonOpen(false);
              }
            }}
            placeholder="Add a reason (optional, e.g. away that weekend)"
            className="flex-1 h-9 rounded-full border bg-muted/50 px-4 text-sm focus:outline-none focus:ring-2 focus:ring-red-300"
          />
          <Button
            size="sm"
            className="rounded-full bg-red-600 hover:bg-red-700 text-white font-bold"
            disabled={setRsvp.isPending}
            onClick={() => {
              submitRsvp("out", reason.trim() || undefined);
              setReasonOpen(false);
            }}
          >
            Save
          </Button>
        </div>
      )}
    </div>
  );
}
