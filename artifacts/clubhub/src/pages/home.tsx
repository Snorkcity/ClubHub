import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useActiveTeam } from "@/lib/active-team";
import {
  useMarkTeamSeen,
  getListTeamUnreadsQueryKey,
} from "@workspace/api-client-react";
import { Link } from "wouter";
import { format, isToday, isTomorrow } from "date-fns";
import { 
  Users, CalendarDays, Activity, MessageSquare, 
  ChevronRight, MapPin, Clock, Plus
} from "lucide-react";
import { 
  useGetMe, useGetClubOverview, useGetFeed, 
  useListUpcomingEvents, useListTeams,
  getGetMeQueryKey, getGetClubOverviewQueryKey, 
  getGetFeedQueryKey, getListUpcomingEventsQueryKey, getListTeamsQueryKey
} from "@workspace/api-client-react";

import { LoadingScreen, ErrorState, EmptyState } from "@/components/ui/states";
import { useTeamUnreads } from "@/components/layout/team-switcher";
import { PostComposer } from "@/components/feed/post-composer";
import { PostCard } from "@/components/feed/post-card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export default function Home() {
  const { data: me, isLoading: meLoading } = useGetMe({ query: { queryKey: getGetMeQueryKey() } });

  if (meLoading) return <LoadingScreen />;
  if (!me) return <ErrorState />;

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="container mx-auto p-4 md:p-8 lg:max-w-6xl space-y-8">
        <header className="mb-8">
          <h1 className="text-3xl font-display font-bold tracking-tight">
            Welcome back, {me.person.firstName}!
          </h1>
          <p className="text-muted-foreground mt-1">
            {format(new Date(), "EEEE, MMMM do")}
          </p>
        </header>

        <UnreadActivityBanner />

        {me.isClubAdmin ? (
          <AdminDashboard />
        ) : (
          <MemberDashboard me={me} />
        )}
      </div>
    </div>
  );
}

/** Prominent pointer to unread posts/messages so nothing gets missed. */
function UnreadActivityBanner() {
  const { data: unreads } = useTeamUnreads();
  const { setActiveTeamId } = useActiveTeam();
  const withUnread = (unreads ?? []).filter((t) => t.unreadPosts + t.unreadMessages > 0);
  if (withUnread.length === 0) return null;

  return (
    <div className="bg-primary/5 border border-primary/25 rounded-2xl p-4">
      <div className="flex items-center gap-2 mb-2">
        <span className="h-2.5 w-2.5 rounded-full bg-destructive animate-pulse" />
        <span className="font-display font-bold text-sm uppercase tracking-wide">New for you</span>
      </div>
      <div className="flex flex-wrap gap-2">
        {withUnread.map((t) => (
          <div key={t.teamId} className="flex items-center gap-1.5">
            {t.unreadPosts > 0 && (
              <button
                onClick={() => setActiveTeamId(t.teamId)}
                className="flex items-center gap-1.5 bg-background border rounded-full pl-3 pr-2 py-1.5 text-sm font-semibold hover:border-primary transition-colors"
              >
                {t.teamName}
                <span className="bg-destructive text-white text-xs font-bold rounded-full px-1.5 py-0.5 leading-none">
                  {t.unreadPosts} {t.unreadPosts === 1 ? "post" : "posts"}
                </span>
              </button>
            )}
            {t.unreadMessages > 0 && (
              <Link
                href="/messages"
                className="flex items-center gap-1.5 bg-background border rounded-full pl-3 pr-2 py-1.5 text-sm font-semibold hover:border-primary transition-colors"
              >
                {t.unreadPosts > 0 ? <MessageSquare className="h-3.5 w-3.5" /> : t.teamName}
                <span className="bg-destructive text-white text-xs font-bold rounded-full px-1.5 py-0.5 leading-none">
                  {t.unreadMessages} {t.unreadMessages === 1 ? "message" : "messages"}
                </span>
              </Link>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function AdminDashboard() {
  const { data: overview, isLoading, error, refetch } = useGetClubOverview({ 
    query: { queryKey: getGetClubOverviewQueryKey() } 
  });

  if (isLoading) return <LoadingScreen message="Loading club overview..." />;
  if (error || !overview) return <ErrorState onRetry={() => refetch()} />;

  const stats = [
    { label: "Teams", value: overview.teamCount, icon: Users, color: "text-blue-500", bg: "bg-blue-50 dark:bg-blue-500/10" },
    { label: "Players", value: overview.playerCount, icon: Activity, color: "text-green-500", bg: "bg-green-50 dark:bg-green-500/10" },
    { label: "Coaches", value: overview.coachCount, icon: ShieldCheck, color: "text-amber-500", bg: "bg-amber-50 dark:bg-amber-500/10" },
    { label: "Parents", value: overview.parentCount, icon: Heart, color: "text-purple-500", bg: "bg-purple-50 dark:bg-purple-500/10" },
  ];

  return (
    <div className="space-y-8">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {stats.map((stat, i) => (
          <div key={i} className="bg-card border rounded-2xl p-5 shadow-sm hover:shadow-md transition-shadow">
            <div className={`h-10 w-10 rounded-xl ${stat.bg} flex items-center justify-center mb-4`}>
              <stat.icon className={`h-5 w-5 ${stat.color}`} />
            </div>
            <p className="text-sm font-medium text-muted-foreground">{stat.label}</p>
            <p className="text-3xl font-display font-bold mt-1">{stat.value}</p>
          </div>
        ))}
      </div>

      <div className="grid md:grid-cols-2 gap-8">
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-display font-bold">Upcoming Club Events</h2>
            <Button variant="ghost" size="sm" asChild>
              <Link href="/schedule">View All <ChevronRight className="h-4 w-4 ml-1" /></Link>
            </Button>
          </div>
          
          {overview.upcomingEvents.length === 0 ? (
            <Card className="p-8 text-center border-dashed bg-muted/20">
              <p className="text-muted-foreground text-sm">No upcoming events this week.</p>
            </Card>
          ) : (
            <div className="flex flex-col gap-3">
              {overview.upcomingEvents.map((event) => (
                <EventCard key={event.id} event={event} />
              ))}
            </div>
          )}
        </div>

        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-display font-bold">Recent Updates</h2>
          </div>
          
          {/* Mobile uses the floating pencil button instead of this card. */}
          <div className="hidden md:block">
            <PostComposer variant="card" />
          </div>

          {overview.recentPosts.length === 0 ? (
            <Card className="p-8 text-center border-dashed bg-muted/20">
              <p className="text-muted-foreground text-sm">No recent activity.</p>
            </Card>
          ) : (
            <div className="flex flex-col gap-4">
              {overview.recentPosts.map((post) => (
                <PostCard key={post.id} post={post} />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/** Marks the given team's content as seen shortly after viewing, then
 * refreshes unread badges. */
function useMarkActiveTeamSeen(teamId: number | null) {
  const queryClient = useQueryClient();
  const markSeen = useMarkTeamSeen({
    mutation: {
      onSuccess: () =>
        queryClient.invalidateQueries({ queryKey: getListTeamUnreadsQueryKey() }),
    },
  });
  const mutate = markSeen.mutate;
  useEffect(() => {
    if (teamId == null) return;
    // Small delay so a quick tab-through doesn't clear the badge.
    const t = setTimeout(() => mutate({ teamId }), 2000);
    return () => clearTimeout(t);
  }, [teamId, mutate]);
}

function MemberDashboard({ me }: { me: any }) {
  const { data: events, isLoading: eventsLoading } = useListUpcomingEvents({ 
    query: { queryKey: getListUpcomingEventsQueryKey() } 
  });
  
  const { data: feed, isLoading: feedLoading } = useGetFeed({
    query: { queryKey: getGetFeedQueryKey() }
  });

  const { data: teams, isLoading: teamsLoading } = useListTeams({
    query: { queryKey: getListTeamsQueryKey() }
  });

  // Active team: filter the feed and mark that team's content as seen.
  const { activeTeamId } = useActiveTeam();
  useMarkActiveTeamSeen(activeTeamId);

  if (eventsLoading || feedLoading || teamsLoading) return <LoadingScreen message="Loading dashboard..." />;

  const visibleFeed =
    activeTeamId == null
      ? feed
      : feed?.filter((p: any) => p.teamId === activeTeamId);

  const nextEvent = events?.[0];

  return (
    <div className="grid lg:grid-cols-3 gap-8">
      <div className="lg:col-span-2 space-y-8">
        
        {/* Next Event — compact banner so posts stay visible below it */}
        {nextEvent && (
          <Link
            href={`/events/${nextEvent.id}`}
            className="block bg-primary text-primary-foreground rounded-2xl px-4 py-3 shadow-md relative overflow-hidden active:scale-[0.99] transition-transform"
          >
            <div className="flex items-center gap-3">
              <div className="flex-1 min-w-0">
                <div className="text-[10px] font-semibold uppercase tracking-wider opacity-80 mb-0.5">
                  Up Next • {formatEventDateDay(nextEvent.startsAt)}
                </div>
                <div className="font-display font-bold text-base truncate">
                  {nextEvent.title}
                  <span className="font-medium opacity-80"> · {nextEvent.teamName}</span>
                </div>
                <div className="flex items-center gap-3 text-xs opacity-90 mt-0.5">
                  <span className="flex items-center gap-1">
                    <Clock className="h-3.5 w-3.5" />
                    {format(new Date(nextEvent.startsAt), "h:mm a")}
                  </span>
                  {nextEvent.location && (
                    <span className="flex items-center gap-1 truncate">
                      <MapPin className="h-3.5 w-3.5 shrink-0" />
                      <span className="truncate">{nextEvent.location}</span>
                    </span>
                  )}
                </div>
              </div>
              <ChevronRight className="h-5 w-5 opacity-70 shrink-0" />
            </div>
          </Link>
        )}

        {/* Team Feed */}
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <h2 className="text-2xl font-display font-bold">Team Feed</h2>
          </div>
          
          {/* Mobile uses the floating pencil button instead of this card. */}
          <div className="hidden md:block">
            <PostComposer variant="card" />
          </div>

          {!visibleFeed || visibleFeed.length === 0 ? (
            <EmptyState 
              title="No updates yet" 
              message="When coaches or managers post updates to your teams, they will appear here."
              icon={MessageSquare}
            />
          ) : (
            <div className="space-y-4">
              {visibleFeed.map((post) => (
                <PostCard key={post.id} post={post} />
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="space-y-8">
        {/* Teams List */}
        <div className="bg-card border rounded-3xl p-6 shadow-sm">
          <div className="flex items-center justify-between mb-6">
            <h3 className="text-lg font-display font-bold">My Teams</h3>
          </div>
          
          {!teams || teams.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">Not assigned to any teams yet.</p>
          ) : (
            <div className="space-y-3">
              {teams.map((team) => (
                <Link key={team.id} href={`/teams/${team.id}`} className="flex items-center justify-between p-3 rounded-2xl hover:bg-muted/50 transition-colors group">
                  <div className="flex items-center gap-3">
                    <div 
                      className="h-10 w-10 rounded-full flex items-center justify-center shrink-0 shadow-sm text-white font-bold"
                      style={{ backgroundColor: team.colorHex || "hsl(var(--primary))" }}
                    >
                      {team.name.charAt(0)}
                    </div>
                    <div className="flex flex-col min-w-0">
                      <span className="font-semibold text-sm truncate">{team.name}</span>
                      <span className="text-xs text-muted-foreground">{team.ageGroup}</span>
                    </div>
                  </div>
                  <ChevronRight className="h-4 w-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                </Link>
              ))}
            </div>
          )}
        </div>

        {/* Upcoming Events List */}
        <div className="space-y-4">
          <h3 className="text-lg font-display font-bold">Upcoming</h3>
          
          {!events || events.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4 border rounded-2xl p-4 text-center border-dashed bg-muted/20">
              No upcoming events
            </p>
          ) : (
            <div className="space-y-3">
              {events.slice(nextEvent ? 1 : 0, 5).map((event) => (
                <EventCard key={event.id} event={event} compact />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// Helpers

function formatEventDateDay(dateStr: string) {
  const date = new Date(dateStr);
  if (isToday(date)) return "Today";
  if (isTomorrow(date)) return "Tomorrow";
  return format(date, "EEEE");
}

function EventCard({ event, compact = false }: { event: any, compact?: boolean }) {
  const typeColors = {
    game: "bg-blue-600 text-white border-transparent",
    training: "bg-emerald-600 text-white border-transparent",
    social: "bg-amber-500 text-white border-transparent",
    other: "bg-slate-600 text-white border-transparent",
  };
  const typeColor = typeColors[event.type as keyof typeof typeColors] || typeColors.other;

  return (
    <Link href={`/events/${event.id}`}>
      <div className="bg-card border rounded-2xl px-4 py-2.5 hover:shadow-md transition-all active:scale-[0.98] cursor-pointer group flex items-center gap-3">
        <div className="flex flex-col items-center justify-center shrink-0 w-10 text-center">
          <span className="text-[10px] font-bold text-muted-foreground uppercase leading-none">{format(new Date(event.startsAt), "MMM")}</span>
          <span className="text-xl font-display font-bold leading-none mt-0.5">{format(new Date(event.startsAt), "d")}</span>
        </div>
        
        <div className="flex-1 min-w-0 flex flex-col justify-center">
          <div className="flex items-center gap-2">
            <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full border ${typeColor}`}>
              {event.type}
            </span>
            <span className="text-xs text-muted-foreground truncate">{event.teamName}</span>
          </div>
          <h4 className="font-bold text-sm truncate pr-4 mt-0.5">{event.title}</h4>
          <div className="flex items-center gap-3 mt-0.5 text-xs text-muted-foreground">
            <span className="flex items-center"><Clock className="h-3 w-3 mr-1" /> {format(new Date(event.startsAt), "h:mm a")}</span>
            {!compact && event.location && (
              <span className="flex items-center truncate"><MapPin className="h-3 w-3 mr-1" /> {event.location}</span>
            )}
          </div>
        </div>
      </div>
    </Link>
  );
}


// Temporary Icon placeholders since lucide-react is imported fully, but not all were destructured.
import { ShieldCheck, Heart } from "lucide-react";
