import { useState } from "react";
import { useParams, Link } from "wouter";
import { format } from "date-fns";
import { 
  CalendarDays, MapPin, Clock, Users, ArrowLeft,
  CheckCircle2, ChevronDown, HelpCircle, XCircle, FileQuestion, MessageSquare, Timer, ExternalLink
} from "lucide-react";
import { locationName, mapsUrl } from "@/lib/location";
import { 
  useGetEvent, useSetRsvp, useCancelEvent, useCreatePost,
  getGetEventQueryKey, getListUpcomingEventsQueryKey, getGetTeamSummaryQueryKey,
  getListTeamPostsQueryKey,
  useGetMe, getGetMeQueryKey
} from "@workspace/api-client-react";
import { queryClient } from "@/lib/queryClient";

import { LoadingScreen, ErrorState, EmptyState } from "@/components/ui/states";
import { EventEditorDialog, initialFromEvent } from "@/components/schedule/new-event-dialog";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
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
  const [notOpen, setNotOpen] = useState(false);
  const [rsvpChoicesOpen, setRsvpChoicesOpen] = useState(false);
  const [notReason, setNotReason] = useState("");
  const [editorOpen, setEditorOpen] = useState(false);
  const [editorMode, setEditorMode] = useState<"edit" | "create">("edit");
  const [cancelOpen, setCancelOpen] = useState(false);
  const [cancelReason, setCancelReason] = useState("");
  const cancelEvent = useCancelEvent();
  const createPost = useCreatePost();
  const { toast } = useToast();

  if (isLoading) return <LoadingScreen message="Loading event details..." />;
  if (error || !eventData) return <ErrorState onRetry={() => refetch()} />;

  const { event, rsvps } = eventData;
  const isStaff =
    !!me?.isClubAdmin ||
    !!me?.memberships?.some(
      (m: any) =>
        m.teamId === event.teamId && (m.role === "coach" || m.role === "manager"),
    );

  function handleRsvp(status: 'going' | 'out', reason?: string) {
    setRsvp.mutate({
      eventId,
      data: { status, ...(status === 'out' ? { reason: reason ?? null } : {}) }
    }, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getGetEventQueryKey(eventId) });
        queryClient.invalidateQueries({ queryKey: getListUpcomingEventsQueryKey() });
        queryClient.invalidateQueries({ queryKey: getGetTeamSummaryQueryKey(event.teamId) });
      }
    });
  }

  const myPersonId = me?.person?.id;

  // Only invited groups get the RSVP prompt: players need "players" invited,
  // coaches/managers need "coaches". Guardians (no membership) act for their
  // player wards, so they follow "players".
  const invited = event.invitedRoles ?? ["coaches", "players", "parents"];
  const myTeamRole = me?.memberships?.find((m: any) => m.teamId === event.teamId)?.role;
  // Self-RSVP requires team membership (server enforces it), so non-members
  // (club admins browsing, guardians) don't get the card at all.
  const amInvited =
    myTeamRole === "player"
      ? invited.includes("players")
      : myTeamRole === "coach" || myTeamRole === "manager"
        ? invited.includes("coaches")
        : false;
  const isCancelled = !!event.cancelledAt;
  // The RSVP card stays visible after answering so it's easy to change.
  const showRsvpCard = !isCancelled && amInvited;

  async function handleCancel(notify: boolean) {
    const reason = cancelReason.trim();
    if (!reason) return;
    try {
      await cancelEvent.mutateAsync({ eventId, data: { reason } });
      if (notify) {
        await createPost.mutateAsync({
          teamId: event.teamId,
          data: {
            title: `Cancelled: ${event.title}`,
            body: `${event.title} on ${format(new Date(event.startsAt), "EEEE d MMMM, h:mmaaa")} has been cancelled. Reason: ${reason}`,
          },
        });
        queryClient.invalidateQueries({ queryKey: getListTeamPostsQueryKey(event.teamId) });
      }
      queryClient.invalidateQueries({ queryKey: getGetEventQueryKey(eventId) });
      queryClient.invalidateQueries({ queryKey: getListUpcomingEventsQueryKey() });
      toast({
        title: "Event cancelled",
        ...(notify ? { description: "The team has been notified in the feed." } : {}),
      });
      setCancelOpen(false);
    } catch {
      toast({ title: "Couldn't cancel the event", variant: "destructive" });
    }
  }

  const typeColors = {
    game: "bg-blue-600 text-white border-transparent",
    training: "bg-emerald-600 text-white border-transparent",
    social: "bg-amber-500 text-white border-transparent",
    other: "bg-slate-600 text-white border-transparent",
  };
  const typeColor = typeColors[event.type as keyof typeof typeColors] || typeColors.other;

  return (
    <div className="flex-1 overflow-y-auto overflow-x-hidden bg-muted/10">
      <EventEditorDialog
        open={editorOpen}
        onOpenChange={setEditorOpen}
        mode={editorMode}
        eventId={editorMode === "edit" ? eventId : undefined}
        teamId={event.teamId}
        teamName={event.teamName}
        initial={initialFromEvent(event, editorMode === "edit")}
      />
      <Dialog open={cancelOpen} onOpenChange={setCancelOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Cancel this event?</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <p className="text-sm font-semibold">Reason</p>
              <Textarea
                value={cancelReason}
                onChange={(e) => setCancelReason(e.target.value)}
                placeholder="e.g. Ground closed due to weather"
                rows={2}
              />
            </div>
            <p className="text-sm text-muted-foreground">
              Notifying posts an announcement to the team feed with the reason.
            </p>
            <div className="space-y-2">
              <Button
                className="w-full rounded-xl h-11 font-bold bg-red-600 hover:bg-red-700 text-white"
                disabled={!cancelReason.trim() || cancelEvent.isPending}
                onClick={() => handleCancel(true)}
              >
                {cancelEvent.isPending ? "Cancelling…" : "Cancel event & notify team"}
              </Button>
              <Button
                variant="outline"
                className="w-full rounded-xl h-11 font-bold"
                disabled={!cancelReason.trim() || cancelEvent.isPending}
                onClick={() => handleCancel(false)}
              >
                Cancel without notifying
              </Button>
              <Button variant="ghost" className="w-full" disabled={cancelEvent.isPending} onClick={() => setCancelOpen(false)}>
                Keep event
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
      <div className="container mx-auto p-4 md:p-8 lg:max-w-4xl space-y-8">
        <Link href="/schedule" className="inline-flex min-h-11 items-center px-3 -ml-3 rounded-xl text-sm font-semibold text-muted-foreground hover:text-foreground hover:bg-muted transition-colors mb-2">
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
              {/* Skip the big heading when it just repeats the type badge (e.g. "Team training"). */}
              {!["team training", "training", "training session", "game", "match"].includes(
                event.title.trim().toLowerCase(),
              ) && (
                <h1 className="text-2xl md:text-4xl font-display font-bold tracking-tight mb-6">
                  {event.title}
                </h1>
              )}

              {isCancelled && (
                <div className="mb-6 rounded-2xl border border-red-200 bg-red-50 dark:bg-red-950/30 dark:border-red-900 p-4">
                  <p className="font-bold text-red-700 dark:text-red-400">This event has been cancelled</p>
                  {event.cancelReason && (
                    <p className="text-sm text-red-700/80 dark:text-red-400/80 mt-1">{event.cancelReason}</p>
                  )}
                </div>
              )}

              {isStaff && (
                <div className="flex flex-wrap gap-2 mb-6">
                  {event.type === "game" && !isCancelled && (
                    <Button asChild variant="outline" className="rounded-xl font-bold">
                      <Link href={`/events/${eventId}/timekeeping`}>
                        <Timer className="h-4 w-4 mr-2" /> Track game time
                      </Link>
                    </Button>
                  )}
                  {!isCancelled && (
                    <Button variant="outline" className="rounded-xl font-bold" onClick={() => { setEditorMode("edit"); setEditorOpen(true); }}>
                      Edit
                    </Button>
                  )}
                  <Button variant="outline" className="rounded-xl font-bold" onClick={() => { setEditorMode("create"); setEditorOpen(true); }}>
                    Duplicate
                  </Button>
                  {!isCancelled && (
                    <Button variant="outline" className="rounded-xl font-bold text-red-700 border-red-300 hover:bg-red-50 dark:hover:bg-red-950/30" onClick={() => setCancelOpen(true)}>
                      Cancel event
                    </Button>
                  )}
                </div>
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
                  <a
                    href={mapsUrl(event.location)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-3 rounded-2xl -m-2 p-2 hover:bg-muted/50 active:bg-muted transition-colors"
                  >
                    <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                      <MapPin className="h-5 w-5 text-primary" />
                    </div>
                    <div className="min-w-0">
                      <p className="font-semibold line-clamp-1">{locationName(event.location)}</p>
                      <p className="text-sm text-primary font-semibold flex items-center gap-1">
                        Open in maps <ExternalLink className="h-3 w-3" />
                      </p>
                    </div>
                  </a>
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
              {invited.length < 3 && (
                <p className="text-sm text-muted-foreground mt-4">
                  Invited: {invited.map((r) => r === "coaches" ? "Coaches" : r === "players" ? "Players" : "Parents").join(" & ")}
                </p>
              )}
            </div>
            
            {/* My RSVP Action — one slim row: status (or question) + pill buttons */}
            {showRsvpCard && (
            <div className="w-full md:w-auto md:min-w-[260px] bg-muted/30 rounded-2xl px-4 py-3 border shrink-0">
              <div className="flex items-center justify-between gap-3">
                <span className="text-sm font-semibold flex items-center gap-1.5 min-w-0">
                  {event.myRsvp === 'going' ? (
                    <><CheckCircle2 className="h-4 w-4 text-green-600 shrink-0" /> You're going</>
                  ) : event.myRsvp === 'out' ? (
                    <><XCircle className="h-4 w-4 text-red-600 shrink-0" /> Not going</>
                  ) : event.myRsvp === 'maybe' ? (
                    <>Maybe going</>
                  ) : (
                    <>Are you going?</>
                  )}
                </span>
                 <div className="flex gap-1.5 shrink-0">
                  {event.myRsvp && !rsvpChoicesOpen ? (
                    <Button
                      size="sm"
                      onClick={() => setRsvpChoicesOpen(true)}
                      disabled={setRsvp.isPending}
                      className={`rounded-full h-9 px-2.5 gap-1.5 ${
                        event.myRsvp === "going"
                          ? "bg-green-600 hover:bg-green-700"
                          : "bg-red-600 hover:bg-red-700 text-white"
                      }`}
                    >
                      {event.myRsvp === "going"
                        ? <CheckCircle2 className="h-4 w-4" />
                        : <XCircle className="h-4 w-4" />}
                      <ChevronDown className="h-3.5 w-3.5" />
                    </Button>
                  ) : (
                  <>
                  <Button
                    size="sm"
                    onClick={() => { setNotOpen(false); setRsvpChoicesOpen(false); if (event.myRsvp !== 'going') handleRsvp('going'); }}
                    disabled={setRsvp.isPending}
                    variant={event.myRsvp === 'going' ? 'default' : 'outline'}
                    className={`rounded-full h-8 px-3 text-xs font-bold ${event.myRsvp === 'going' ? 'bg-green-600 hover:bg-green-700' : 'text-green-700 border-green-300'}`}
                  >
                    Going
                  </Button>
                  <Button
                    size="sm"
                    onClick={() => setNotOpen(true)}
                    disabled={setRsvp.isPending}
                    variant={event.myRsvp === 'out' ? 'default' : 'outline'}
                    className={`rounded-full h-8 px-3 text-xs font-bold ${event.myRsvp === 'out' ? 'bg-red-600 hover:bg-red-700 text-white' : 'text-red-700 border-red-300'}`}
                  >
                    Not
                  </Button>
                  </>
                  )}
                </div>
              </div>
              {notOpen && (
                <div className="mt-2.5 flex gap-2 animate-in fade-in slide-in-from-top-1 duration-150">
                  <input
                    autoFocus
                    value={notReason}
                    onChange={(e) => setNotReason(e.target.value)}
                    placeholder="Reason (optional)"
                    className="h-9 flex-1 min-w-0 rounded-xl border bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-red-300"
                  />
                  <Button
                    size="sm"
                    disabled={setRsvp.isPending}
                    className="rounded-xl h-9 bg-red-600 hover:bg-red-700 text-white font-bold shrink-0"
                    onClick={() => { handleRsvp('out', notReason.trim() || undefined); setNotOpen(false); }}
                  >
                    Save
                  </Button>
                </div>
              )}
            </div>
            )}
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
            <h2 className="text-xl font-display font-bold">Team Availability</h2>
          </div>

          {(() => {
            const byName = (a: typeof rsvps[number], b: typeof rsvps[number]) =>
              a.person.fullName.localeCompare(b.person.fullName);
            const isStaffRole = (r: typeof rsvps[number]) => r.role === "coach" || r.role === "manager";
            const staffGoing = rsvps.filter((r) => r.status === "going" && isStaffRole(r)).sort(byName);
            const playersGoing = rsvps.filter((r) => r.status === "going" && !isStaffRole(r)).sort(byName);
            const unavailable = rsvps.filter((r) => r.status !== "going").sort(byName);

            const Row = ({ rsvp }: { rsvp: typeof rsvps[number] }) => {
              const isMe = myPersonId != null && rsvp.person.id === myPersonId;
              return (
                <div
                  key={rsvp.id}
                  onClick={isMe ? () => { setNotOpen(false); window.scrollTo({ top: 0, behavior: "smooth" }); } : undefined}
                  className={`bg-card p-3 flex items-center gap-3 transition-colors ${
                    isMe ? "cursor-pointer hover:bg-muted/50 active:bg-muted" : ""
                  }`}
                >
                  <Avatar className="h-10 w-10 border shadow-sm">
                    <AvatarImage src={rsvp.person.avatarUrl || undefined} />
                    <AvatarFallback>{rsvp.person.firstName?.charAt(0)}</AvatarFallback>
                  </Avatar>
                  <div className="flex flex-col flex-1 min-w-0">
                    <span className="font-semibold text-sm truncate">
                      {rsvp.person.fullName}
                      {isMe && <span className="text-muted-foreground font-normal"> (you)</span>}
                    </span>
                    {rsvp.reason && rsvp.status !== "going" && (
                      <span className="text-xs text-muted-foreground truncate italic">{rsvp.reason}</span>
                    )}
                  </div>
                  {rsvp.status === "out" && (
                    <span className="text-[11px] font-bold uppercase text-red-500 shrink-0">Not going</span>
                  )}
                  {rsvp.status === "maybe" && (
                    <span className="text-[11px] font-bold uppercase text-amber-600 shrink-0">Maybe</span>
                  )}
                  {isMe && (
                    <span className="text-[11px] font-semibold text-muted-foreground shrink-0">Tap to change</span>
                  )}
                </div>
              );
            };

            const Section = ({ title, items, accent }: { title: string; items: typeof rsvps; accent: string }) =>
              items.length === 0 ? null : (
                <div>
                  <div className={`px-4 py-2 text-[11px] font-bold uppercase tracking-wider ${accent} bg-muted/40 border-y first:border-t-0`}>
                    {title}
                  </div>
                  <div className="divide-y">
                    {items.map((r) => <Row key={r.id} rsvp={r} />)}
                  </div>
                </div>
              );

            const staffTotal = eventData.teamStaffCount ?? 0;
            const playerTotal = eventData.teamPlayerCount ?? 0;
            return (
              <>
                <div className="flex flex-wrap gap-2 mb-3">
                  <span className="inline-flex items-center gap-1.5 rounded-full border bg-card px-3 py-1 text-xs font-bold">
                    <span className="h-2 w-2 rounded-full bg-green-600" />
                    Players {playersGoing.length}{playerTotal ? `/${playerTotal}` : ""} going
                  </span>
                  <span className="inline-flex items-center gap-1.5 rounded-full border bg-card px-3 py-1 text-xs font-bold">
                    <span className="h-2 w-2 rounded-full bg-emerald-600" />
                    Coaches {staffGoing.length}{staffTotal ? `/${staffTotal}` : ""} going
                  </span>
                  <span className="inline-flex items-center gap-1.5 rounded-full border bg-card px-3 py-1 text-xs font-bold text-red-600">
                    <span className="h-2 w-2 rounded-full bg-red-500" />
                    {unavailable.length} not going
                  </span>
                </div>
                <div className="bg-card border rounded-3xl overflow-hidden shadow-sm">
                  <Section title={`Coaches going · ${staffGoing.length}${staffTotal ? ` of ${staffTotal}` : ""}`} items={staffGoing} accent="text-emerald-700" />
                  <Section title={`Players going · ${playersGoing.length}${playerTotal ? ` of ${playerTotal}` : ""}`} items={playersGoing} accent="text-green-700" />
                  <Section title={`Not going · ${unavailable.length}`} items={unavailable} accent="text-red-600" />
                  {rsvps.length === 0 && (
                    <EmptyState title="No RSVPs yet" message="Be the first to respond to this event." icon={FileQuestion} />
                  )}
                </div>
              </>
            );
          })()}
        </div>
      </div>
    </div>
  );
}
