import { useParams, Link } from "wouter";
import { format } from "date-fns";
import { 
  CalendarDays, MapPin, Clock, Users, ArrowLeft,
  CheckCircle2, HelpCircle, XCircle, FileQuestion, MessageSquare, Timer
} from "lucide-react";
import { 
  useGetEvent, useSetRsvp, 
  getGetEventQueryKey, getListUpcomingEventsQueryKey,
  useGetMe, getGetMeQueryKey
} from "@workspace/api-client-react";
import { queryClient } from "@/lib/queryClient";

import { LoadingScreen, ErrorState, EmptyState } from "@/components/ui/states";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";

export default function EventDetail() {
  const params = useParams();
  const eventId = Number(params.eventId);

  const { data: eventData, isLoading, error, refetch } = useGetEvent(eventId, { 
    query: { enabled: !!eventId, queryKey: getGetEventQueryKey(eventId) } 
  });
  
  const setRsvp = useSetRsvp();
  const { data: me } = useGetMe({ query: { queryKey: getGetMeQueryKey() } });

  if (isLoading) return <LoadingScreen message="Loading event details..." />;
  if (error || !eventData) return <ErrorState onRetry={() => refetch()} />;

  const { event, rsvps } = eventData;
  const isStaff =
    !!me?.isClubAdmin ||
    !!me?.memberships?.some(
      (m: any) =>
        m.teamId === event.teamId && (m.role === "coach" || m.role === "manager"),
    );

  function handleRsvp(status: 'going' | 'maybe' | 'out') {
    if (event.myRsvp === status) return;
    
    setRsvp.mutate({
      eventId,
      data: { status }
    }, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getGetEventQueryKey(eventId) });
        queryClient.invalidateQueries({ queryKey: getListUpcomingEventsQueryKey() });
      }
    });
  }

  const typeColors = {
    game: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400 border-blue-200 dark:border-blue-800/50",
    training: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400 border-green-200 dark:border-green-800/50",
    social: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400 border-amber-200 dark:border-amber-800/50",
    other: "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300 border-gray-200 dark:border-gray-700",
  };
  const typeColor = typeColors[event.type as keyof typeof typeColors] || typeColors.other;

  return (
    <div className="flex-1 overflow-y-auto bg-muted/10">
      <div className="container mx-auto p-4 md:p-8 lg:max-w-4xl space-y-8">
        <Link href="/schedule" className="inline-flex items-center text-sm font-semibold text-muted-foreground hover:text-foreground transition-colors mb-2">
          <ArrowLeft className="h-4 w-4 mr-1" /> Back to Schedule
        </Link>
        
        <div className="bg-card border rounded-3xl p-6 md:p-10 shadow-sm relative overflow-hidden">
          <div className={`absolute top-0 left-0 right-0 h-3 ${typeColor.split(' ')[0]}`} />
          
          <div className="flex flex-col md:flex-row gap-8 items-start md:items-center justify-between">
            <div className="flex-1">
              <div className="flex items-center gap-3 mb-4">
                <Badge variant="outline" className={`font-semibold uppercase ${typeColor}`}>
                  {event.type}
                </Badge>
                <Link href={`/teams/${event.teamId}`} className="text-sm font-bold text-muted-foreground hover:text-foreground">
                  {event.teamName}
                </Link>
              </div>
              <h1 className="text-3xl md:text-5xl font-display font-bold tracking-tight mb-6">
                {event.title}
              </h1>

              {isStaff && event.type === "game" && (
                <Button asChild variant="outline" className="rounded-xl mb-6 font-bold">
                  <Link href={`/events/${eventId}/timekeeping`}>
                    <Timer className="h-4 w-4 mr-2" /> Track game time
                  </Link>
                </Button>
              )}
              
              <div className="grid sm:grid-cols-2 gap-4">
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                    <CalendarDays className="h-5 w-5 text-primary" />
                  </div>
                  <div>
                    <p className="font-semibold">{format(new Date(event.startsAt), "EEEE, MMMM do")}</p>
                    <p className="text-sm text-muted-foreground">{format(new Date(event.startsAt), "h:mm a")}{event.endsAt ? ` - ${format(new Date(event.endsAt), "h:mm a")}` : ''}</p>
                  </div>
                </div>
                
                {event.location && (
                  <div className="flex items-center gap-3">
                    <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                      <MapPin className="h-5 w-5 text-primary" />
                    </div>
                    <div>
                      <p className="font-semibold">Location</p>
                      <p className="text-sm text-muted-foreground line-clamp-1">{event.location}</p>
                    </div>
                  </div>
                )}
                
                {event.opponent && (
                  <div className="flex items-center gap-3">
                    <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                      <Users className="h-5 w-5 text-primary" />
                    </div>
                    <div>
                      <p className="font-semibold">Opponent</p>
                      <p className="text-sm text-muted-foreground line-clamp-1">{event.opponent}</p>
                    </div>
                  </div>
                )}
              </div>
            </div>
            
            {/* My RSVP Action */}
            <div className="w-full md:w-auto bg-muted/30 rounded-2xl p-6 border text-center shrink-0">
              <h3 className="font-display font-bold text-lg mb-4">Your RSVP</h3>
              <div className="flex flex-row md:flex-col gap-2">
                <Button 
                  onClick={() => handleRsvp('going')} 
                  disabled={setRsvp.isPending}
                  variant={event.myRsvp === 'going' ? 'default' : 'outline'}
                  className={`rounded-xl h-12 flex-1 md:w-48 justify-start ${event.myRsvp === 'going' ? 'bg-green-600 hover:bg-green-700' : ''}`}
                >
                  <CheckCircle2 className="h-5 w-5 mr-2" /> Going
                </Button>
                <Button 
                  onClick={() => handleRsvp('maybe')} 
                  disabled={setRsvp.isPending}
                  variant={event.myRsvp === 'maybe' ? 'default' : 'outline'}
                  className={`rounded-xl h-12 flex-1 md:w-48 justify-start ${event.myRsvp === 'maybe' ? 'bg-amber-500 hover:bg-amber-600 text-white' : ''}`}
                >
                  <HelpCircle className="h-5 w-5 mr-2" /> Maybe
                </Button>
                <Button 
                  onClick={() => handleRsvp('out')} 
                  disabled={setRsvp.isPending}
                  variant={event.myRsvp === 'out' ? 'default' : 'outline'}
                  className={`rounded-xl h-12 flex-1 md:w-48 justify-start ${event.myRsvp === 'out' ? 'bg-red-500 hover:bg-red-600 text-white' : ''}`}
                >
                  <XCircle className="h-5 w-5 mr-2" /> Out
                </Button>
              </div>
            </div>
          </div>
          
          {event.notes && (
            <div className="mt-8 pt-8 border-t">
              <h3 className="font-bold mb-2 flex items-center gap-2"><MessageSquare className="h-4 w-4" /> Coach's Notes</h3>
              <p className="text-muted-foreground leading-relaxed whitespace-pre-wrap">{event.notes}</p>
            </div>
          )}
        </div>

        {/* Availability Section */}
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <h2 className="text-2xl font-display font-bold">Team Availability</h2>
          </div>
          
          <div className="grid grid-cols-3 gap-4 mb-6">
            <div className="bg-card border rounded-2xl p-4 text-center">
              <div className="text-3xl font-display font-bold text-green-600">{event.goingCount}</div>
              <div className="text-xs font-semibold text-muted-foreground uppercase mt-1">Going</div>
            </div>
            <div className="bg-card border rounded-2xl p-4 text-center">
              <div className="text-3xl font-display font-bold text-amber-500">{event.maybeCount}</div>
              <div className="text-xs font-semibold text-muted-foreground uppercase mt-1">Maybe</div>
            </div>
            <div className="bg-card border rounded-2xl p-4 text-center">
              <div className="text-3xl font-display font-bold text-red-500">{event.outCount}</div>
              <div className="text-xs font-semibold text-muted-foreground uppercase mt-1">Out</div>
            </div>
          </div>

          <div className="bg-card border rounded-3xl overflow-hidden shadow-sm">
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-px bg-border">
              {rsvps.map((rsvp) => (
                <div key={rsvp.id} className="bg-card p-4 flex items-center gap-4 hover:bg-muted/30 transition-colors">
                  <Avatar className="h-12 w-12 border shadow-sm">
                    <AvatarImage src={rsvp.person.avatarUrl || undefined} />
                    <AvatarFallback>{rsvp.person.firstName?.charAt(0)}</AvatarFallback>
                  </Avatar>
                  <div className="flex flex-col flex-1 min-w-0">
                    <span className="font-semibold text-sm truncate">{rsvp.person.fullName}</span>
                    <span className={`text-xs font-bold uppercase ${
                      rsvp.status === 'going' ? 'text-green-600' :
                      rsvp.status === 'maybe' ? 'text-amber-500' : 'text-red-500'
                    }`}>
                      {rsvp.status}
                    </span>
                  </div>
                </div>
              ))}
            </div>
            {rsvps.length === 0 && (
              <EmptyState title="No RSVPs yet" message="Be the first to respond to this event." icon={FileQuestion} />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
