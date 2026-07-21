import { useState } from "react";
import { useParams, Link } from "wouter";
import { format } from "date-fns";
import { 
  CalendarDays, MapPin, Clock, Users, ArrowRight, ShieldCheck, 
  MessageSquare, Pin, ChevronLeft, Calendar as CalendarIcon
} from "lucide-react";
import { 
  useGetTeam, useGetTeamSummary, useListTeamMembers, useGetMe,
  getGetTeamQueryKey, getGetTeamSummaryQueryKey, getListTeamMembersQueryKey
} from "@workspace/api-client-react";

import { LoadingScreen, ErrorState, EmptyState } from "@/components/ui/states";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AddMemberDialog, RemoveMemberButton } from "@/components/admin/team-roster-admin";

export default function TeamDetail() {
  const params = useParams();
  const teamId = Number(params.teamId);

  const { data: team, isLoading: teamLoading, error, refetch } = useGetTeam(teamId, { 
    query: { enabled: !!teamId, queryKey: getGetTeamQueryKey(teamId) } 
  });
  
  const { data: summary, isLoading: summaryLoading } = useGetTeamSummary(teamId, {
    query: { enabled: !!teamId, queryKey: getGetTeamSummaryQueryKey(teamId) }
  });

  const { data: members, isLoading: membersLoading } = useListTeamMembers(teamId, {
    query: { enabled: !!teamId, queryKey: getListTeamMembersQueryKey(teamId) }
  });

  const { data: me } = useGetMe();

  if (teamLoading || summaryLoading || membersLoading) return <LoadingScreen message="Loading team details..." />;
  if (error || !team || !summary) return <ErrorState onRetry={() => refetch()} />;

  const isManager = me?.isClubAdmin || me?.memberships.some((m: any) => m.teamId === teamId && m.role === 'manager');
  const isCoach = isManager || me?.memberships.some((m: any) => m.teamId === teamId && m.role === 'coach');
  const existingUserIds = (members ?? []).map((m) => m.person.id);

  return (
    <div className="flex-1 overflow-y-auto bg-muted/5 relative">
      {/* Team Header */}
      <div 
        className="h-32 md:h-48 w-full shrink-0"
        style={{ backgroundColor: team.colorHex || "hsl(var(--primary))" }}
      />
      
      <div className="container mx-auto px-4 md:px-8 pb-12 lg:max-w-6xl -mt-16 md:-mt-20">
        <div className="bg-card border rounded-3xl p-6 shadow-sm mb-8 flex flex-col md:flex-row gap-6 items-start md:items-center relative">
          <div 
            className="h-24 w-24 md:h-32 md:w-32 shrink-0 rounded-3xl border-4 border-card flex items-center justify-center text-4xl md:text-5xl font-bold text-white shadow-md z-10 bg-primary"
            style={{ backgroundColor: team.colorHex || "hsl(var(--primary))" }}
          >
            {team.name.charAt(0)}
          </div>
          
          <div className="flex-1 min-w-0 pt-2 md:pt-4">
            <div className="flex items-center gap-3 mb-1">
              <h1 className="text-3xl md:text-4xl font-display font-bold tracking-tight truncate">
                {team.name}
              </h1>
              {team.gender && <Badge variant="secondary" className="font-semibold uppercase">{team.gender}</Badge>}
            </div>
            <p className="text-lg text-muted-foreground font-medium">
              {team.ageGroup} {team.seasonName ? `• ${team.seasonName}` : ''}
            </p>
          </div>
          
          <div className="flex items-center gap-4 w-full md:w-auto mt-4 md:mt-0 pt-4 md:pt-0 border-t md:border-t-0 border-border">
            <div className="text-center px-4">
              <div className="text-2xl font-display font-bold">{summary.playerCount}</div>
              <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Players</div>
            </div>
            {isCoach && (
              <div className="flex gap-2 ml-auto md:ml-4">
                <Button asChild variant="outline" className="rounded-xl">
                  <Link href={`/teams/${teamId}/monitoring`}>Monitoring</Link>
                </Button>
                <Button asChild variant="outline" className="rounded-xl">
                  <Link href={`/teams/${teamId}/minutes`}>Minutes</Link>
                </Button>
              </div>
            )}
          </div>
        </div>

        <Tabs defaultValue="overview" className="w-full">
          <TabsList className="bg-transparent border-b w-full justify-start rounded-none h-auto p-0 mb-8 overflow-x-auto hide-scrollbar">
            <TabsTrigger value="overview" className="data-[state=active]:bg-transparent data-[state=active]:shadow-none data-[state=active]:border-primary border-b-2 border-transparent rounded-none px-4 py-3 font-semibold text-base">
              Overview
            </TabsTrigger>
            <TabsTrigger value="roster" className="data-[state=active]:bg-transparent data-[state=active]:shadow-none data-[state=active]:border-primary border-b-2 border-transparent rounded-none px-4 py-3 font-semibold text-base">
              Roster
            </TabsTrigger>
          </TabsList>
          
          <TabsContent value="overview" className="mt-0">
            <div className="grid lg:grid-cols-3 gap-8">
              <div className="lg:col-span-2 space-y-8">
                {/* Next Event */}
                {summary.nextEvent && (
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <h2 className="text-xl font-display font-bold flex items-center gap-2">
                        <CalendarDays className="h-5 w-5 text-primary" /> Up Next
                      </h2>
                    </div>
                    <Card className="p-6 rounded-3xl border-primary/20 bg-primary/5 shadow-sm">
                      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-2">
                            <Badge variant="outline" className="bg-background font-semibold uppercase">{summary.nextEvent.type}</Badge>
                            <span className="text-sm font-semibold text-primary">{format(new Date(summary.nextEvent.startsAt), "EEEE, MMMM do")}</span>
                          </div>
                          <h3 className="text-2xl font-bold mb-3">{summary.nextEvent.title}</h3>
                          <div className="flex flex-wrap gap-4 text-sm text-muted-foreground font-medium">
                            <span className="flex items-center text-foreground"><Clock className="h-4 w-4 mr-1.5 opacity-70" /> {format(new Date(summary.nextEvent.startsAt), "h:mm a")}</span>
                            {summary.nextEvent.location && (
                              <span className="flex items-center"><MapPin className="h-4 w-4 mr-1.5 opacity-70" /> {summary.nextEvent.location}</span>
                            )}
                          </div>
                        </div>
                        
                        <div className="shrink-0">
                          <div className="bg-background rounded-2xl p-4 border shadow-sm w-full md:w-48">
                            <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3 text-center">Availability</div>
                            <div className="flex items-end justify-center gap-4">
                              <div className="text-center">
                                <div className="text-xl font-bold text-green-600">{summary.goingCount}</div>
                                <div className="text-[10px] text-muted-foreground font-medium">IN</div>
                              </div>
                              <div className="text-center">
                                <div className="text-lg font-bold text-amber-500">{summary.maybeCount}</div>
                                <div className="text-[10px] text-muted-foreground font-medium">MAYBE</div>
                              </div>
                              <div className="text-center">
                                <div className="text-lg font-bold text-red-500">{summary.outCount}</div>
                                <div className="text-[10px] text-muted-foreground font-medium">OUT</div>
                              </div>
                            </div>
                            <Button asChild className="w-full mt-4 rounded-xl" size="sm">
                              <Link href={`/events/${summary.nextEvent.id}`}>View Details</Link>
                            </Button>
                          </div>
                        </div>
                      </div>
                    </Card>
                  </div>
                )}

                {/* Team Posts */}
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <h2 className="text-xl font-display font-bold flex items-center gap-2">
                      <MessageSquare className="h-5 w-5 text-primary" /> Team Feed
                    </h2>
                    {isCoach && (
                      <Button size="sm" className="rounded-xl shadow-sm">
                        Post Update
                      </Button>
                    )}
                  </div>
                  
                  {summary.recentPostCount === 0 ? (
                    <EmptyState 
                      title="No posts yet" 
                      message="Updates from coaches and managers will appear here." 
                      icon={MessageSquare} 
                    />
                  ) : (
                    <Card className="p-8 text-center border-dashed bg-muted/20 rounded-3xl">
                      <p className="text-muted-foreground">Team posts would load here. Use /teams/:id/posts API.</p>
                    </Card>
                  )}
                </div>
              </div>

              {/* Sidebar */}
              <div className="space-y-8">
                {/* Staff */}
                <div className="bg-card border rounded-3xl p-6 shadow-sm">
                  <div className="flex items-center justify-between mb-4 gap-2">
                    <h3 className="text-lg font-display font-bold flex items-center gap-2">
                      <ShieldCheck className="h-5 w-5 text-primary" /> Staff
                    </h3>
                    {isManager && (
                      <AddMemberDialog teamId={teamId} existingUserIds={existingUserIds} mode="staff" />
                    )}
                  </div>
                  
                  <div className="space-y-4">
                    {members?.filter(m => m.role === 'manager' || m.role === 'coach').map((staff) => (
                      <div key={staff.id} className="flex items-center gap-3">
                        <Avatar className="h-10 w-10 border shadow-sm">
                          <AvatarImage src={staff.person.avatarUrl || undefined} />
                          <AvatarFallback>{staff.person.firstName?.charAt(0)}</AvatarFallback>
                        </Avatar>
                        <div className="flex flex-col min-w-0">
                          <span className="font-semibold text-sm truncate">{staff.person.fullName}</span>
                          <span className="text-xs font-medium text-muted-foreground capitalize">{staff.role}</span>
                        </div>
                        {isManager && (
                          <RemoveMemberButton memberId={staff.id} teamId={teamId} name={staff.person.fullName} className="ml-auto" />
                        )}
                      </div>
                    ))}
                    {members?.filter(m => m.role === 'manager' || m.role === 'coach').length === 0 && (
                      <p className="text-sm text-muted-foreground">No staff assigned.</p>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </TabsContent>
          
          <TabsContent value="roster" className="mt-0">
            <div className="bg-card border rounded-3xl overflow-hidden shadow-sm">
              <div className="p-6 border-b flex items-center justify-between">
                <h2 className="text-xl font-display font-bold flex items-center gap-2">
                  <Users className="h-5 w-5 text-primary" /> Player Roster
                </h2>
                {isManager && (
                  <AddMemberDialog teamId={teamId} existingUserIds={existingUserIds} mode="player" />
                )}
              </div>
              
              <div className="grid sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-px bg-border">
                {members?.filter(m => m.role === 'player').map((player) => (
                  <div key={player.id} className="relative">
                    {isManager && (
                      <RemoveMemberButton memberId={player.id} teamId={teamId} name={player.person.fullName} className="absolute top-2 right-2 z-10 bg-card/80 backdrop-blur" />
                    )}
                    <Link href={`/people/${player.person.id}`}>
                    <div className="bg-card p-6 flex flex-col items-center text-center hover:bg-muted/30 transition-colors cursor-pointer group h-full">
                      <Avatar className="h-20 w-20 border-2 shadow-sm mb-4">
                        <AvatarImage src={player.person.avatarUrl || undefined} />
                        <AvatarFallback className="text-xl font-bold bg-primary/10 text-primary">
                          {player.person.firstName?.charAt(0)}{player.person.lastName?.charAt(0)}
                        </AvatarFallback>
                      </Avatar>
                      <h4 className="font-bold text-lg leading-tight group-hover:text-primary transition-colors">{player.person.fullName}</h4>
                      
                      {(player.jerseyNumber || player.position) && (
                        <div className="mt-3 flex items-center gap-2">
                          {player.jerseyNumber && (
                            <Badge variant="outline" className="font-bold font-mono px-2 py-0.5 border-primary/20 bg-primary/5 text-primary">#{player.jerseyNumber}</Badge>
                          )}
                          {player.position && (
                            <span className="text-xs font-semibold text-muted-foreground uppercase">{player.position}</span>
                          )}
                        </div>
                      )}
                    </div>
                    </Link>
                  </div>
                ))}
              </div>
              {members?.filter(m => m.role === 'player').length === 0 && (
                <div className="p-12 text-center">
                  <p className="text-muted-foreground">No players assigned to this roster yet.</p>
                </div>
              )}
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
