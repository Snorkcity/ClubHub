import { format, isToday, isTomorrow } from "date-fns";
import { Link } from "wouter";
import { CalendarDays, MapPin, Clock, Users, ArrowRight } from "lucide-react";
import { 
  useListUpcomingEvents, getListUpcomingEventsQueryKey,
  useSetRsvp, getGetEventQueryKey, getGetTeamSummaryQueryKey
} from "@workspace/api-client-react";
import { queryClient } from "@/lib/queryClient";

import { LoadingScreen, ErrorState, EmptyState } from "@/components/ui/states";
import { Badge } from "@/components/ui/badge";

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
    <div className="flex-1 overflow-y-auto bg-muted/10">
      <div className="container mx-auto p-4 md:p-8 lg:max-w-4xl">
        <header className="mb-10">
          <h1 className="text-3xl font-display font-bold tracking-tight">Schedule</h1>
          <p className="text-muted-foreground mt-1">Upcoming events across all your teams.</p>
        </header>

        {events.length === 0 ? (
          <EmptyState 
            title="Your schedule is clear" 
            message="There are no upcoming events for any of your teams right now."
            icon={CalendarDays}
          />
        ) : (
          <div className="space-y-12">
            {sortedDays.map((day) => {
              const dayEvents = groupedEvents[day];
              const dateObj = new Date(day + 'T12:00:00'); // Midday to avoid timezone shifting
              
              let dayLabel = format(dateObj, "EEEE, MMMM d");
              if (isToday(dateObj)) dayLabel = `Today, ${format(dateObj, "MMM d")}`;
              if (isTomorrow(dateObj)) dayLabel = `Tomorrow, ${format(dateObj, "MMM d")}`;

              return (
                <div key={day} className="space-y-4">
                  <h2 className="text-xl font-display font-bold sticky top-0 bg-muted/10 backdrop-blur-md py-2 z-10">
                    {dayLabel}
                  </h2>
                  <div className="flex flex-col gap-4">
                    {dayEvents.map(event => (
                      <ScheduleCard key={event.id} event={event} />
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

function ScheduleCard({ event }: { event: any }) {
  const setRsvp = useSetRsvp();
  
  const typeColors = {
    game: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400 border-blue-200 dark:border-blue-800/50",
    training: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400 border-green-200 dark:border-green-800/50",
    social: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400 border-amber-200 dark:border-amber-800/50",
    other: "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300 border-gray-200 dark:border-gray-700",
  };
  const typeColor = typeColors[event.type as keyof typeof typeColors] || typeColors.other;

  function handleRsvp(status: 'going' | 'maybe' | 'out') {
    if (event.myRsvp === status) return; // already set
    
    setRsvp.mutate({
      eventId: event.id,
      data: { status }
    }, {
      onSuccess: () => {
        // Invalidate lists
        queryClient.invalidateQueries({ queryKey: getListUpcomingEventsQueryKey() });
        queryClient.invalidateQueries({ queryKey: getGetEventQueryKey(event.id) });
        queryClient.invalidateQueries({ queryKey: getGetTeamSummaryQueryKey(event.teamId) });
      }
    });
  }

  return (
    <div className="bg-card border rounded-3xl p-5 hover:shadow-md transition-shadow group flex flex-col md:flex-row md:items-center gap-6 relative overflow-hidden">
      <div className={`absolute top-0 left-0 bottom-0 w-1.5 ${typeColor.split(' ')[0]}`} />
      
      {/* Time & Type block */}
      <div className="flex flex-row md:flex-col items-center md:items-start justify-between md:justify-center md:w-32 shrink-0 border-b md:border-b-0 md:border-r border-border pb-4 md:pb-0 md:pr-4">
        <div>
          <div className="font-display font-bold text-xl">{format(new Date(event.startsAt), "h:mm")}</div>
          <div className="text-sm font-semibold text-muted-foreground uppercase">{format(new Date(event.startsAt), "a")}</div>
        </div>
        <Badge variant="outline" className={`md:mt-3 ${typeColor}`}>
          {event.type}
        </Badge>
      </div>

      {/* Main Content */}
      <div className="flex-1 min-w-0 flex flex-col">
        <Link href={`/teams/${event.teamId}`} className="text-sm font-bold text-primary hover:underline w-fit mb-1">
          {event.teamName}
        </Link>
        <Link href={`/events/${event.id}`}>
          <h3 className="text-xl font-bold group-hover:text-primary transition-colors cursor-pointer truncate mb-2">
            {event.title}
          </h3>
        </Link>
        
        <div className="flex flex-wrap gap-4 text-sm text-muted-foreground">
          {event.location && (
            <span className="flex items-center"><MapPin className="h-4 w-4 mr-1.5 opacity-70" /> {event.location}</span>
          )}
          {event.opponent && (
            <span className="flex items-center"><Users className="h-4 w-4 mr-1.5 opacity-70" /> vs {event.opponent}</span>
          )}
        </div>
      </div>

      {/* RSVP block */}
      <div className="shrink-0 flex items-center justify-between md:justify-end gap-4 mt-2 md:mt-0 pt-4 md:pt-0 border-t md:border-t-0 border-border">
        <div className="flex rounded-full bg-muted/50 p-1 border">
          <button 
            onClick={() => handleRsvp('going')}
            disabled={setRsvp.isPending}
            className={`px-4 py-1.5 rounded-full text-sm font-semibold transition-all ${
              event.myRsvp === 'going' 
                ? 'bg-green-500 text-white shadow-sm' 
                : 'text-muted-foreground hover:text-foreground hover:bg-muted'
            }`}
          >
            Going
          </button>
          <button 
            onClick={() => handleRsvp('maybe')}
            disabled={setRsvp.isPending}
            className={`px-4 py-1.5 rounded-full text-sm font-semibold transition-all ${
              event.myRsvp === 'maybe' 
                ? 'bg-amber-500 text-white shadow-sm' 
                : 'text-muted-foreground hover:text-foreground hover:bg-muted'
            }`}
          >
            Maybe
          </button>
          <button 
            onClick={() => handleRsvp('out')}
            disabled={setRsvp.isPending}
            className={`px-4 py-1.5 rounded-full text-sm font-semibold transition-all ${
              event.myRsvp === 'out' 
                ? 'bg-red-500 text-white shadow-sm' 
                : 'text-muted-foreground hover:text-foreground hover:bg-muted'
            }`}
          >
            Out
          </button>
        </div>
        
        <Link href={`/events/${event.id}`} className="h-10 w-10 rounded-full bg-primary/5 text-primary flex items-center justify-center hover:bg-primary/10 transition-colors hidden md:flex">
          <ArrowRight className="h-5 w-5" />
        </Link>
      </div>
    </div>
  );
}
