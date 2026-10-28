import { Link } from "wouter";
import { UserSquare2, Mail, Phone } from "lucide-react";
import {
  useGetMe,
  getGetMeQueryKey,
  useListPeople,
  getListPeopleQueryKey,
  useListTeams,
  getListTeamsQueryKey,
} from "@workspace/api-client-react";

import { LoadingScreen, ErrorState, EmptyState } from "@/components/ui/states";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { useActiveTeam } from "@/lib/active-team";
import { InvitePersonDialog } from "@/components/people/invite-person-dialog";

export default function PeopleList() {
  const { activeTeamId } = useActiveTeam();
  const { data: me, isLoading: meLoading } = useGetMe({
    query: { queryKey: getGetMeQueryKey() },
  });
  const { data: clubTeams } = useListTeams({
    query: { enabled: !!me?.isClubAdmin, queryKey: getListTeamsQueryKey() },
  });
  const inviteTeams = me?.isClubAdmin
    ? (clubTeams ?? []).map((team) => ({ id: team.id, name: team.name }))
    : (me?.memberships ?? [])
        .filter((membership) => membership.role === "coach" || membership.role === "manager")
        .map((membership) => ({ id: membership.teamId, name: membership.teamName }));
  const staffedTeamIds = new Set(
    (me?.memberships ?? [])
      .filter((membership) => membership.role === "coach" || membership.role === "manager")
      .map((membership) => membership.teamId),
  );
  const teamId = me?.isClubAdmin
    ? inviteTeams.find((team) => team.id === activeTeamId)?.id ??
      (inviteTeams.length === 1 ? inviteTeams[0].id : undefined)
    : activeTeamId && staffedTeamIds.has(activeTeamId)
      ? activeTeamId
      : staffedTeamIds.values().next().value;
  const canInvite = inviteTeams.length > 0;
  const params = { teamId };

  const { data: people, isLoading, isFetching, error, refetch } = useListPeople(params, {
    query: {
      enabled: !meLoading && (!!me?.isClubAdmin || !!teamId),
      queryKey: getListPeopleQueryKey(params),
    },
  });
  const summaryParams = { teamId };
  const { data: summaryPeople, isLoading: summaryLoading } = useListPeople(summaryParams, {
    query: {
      enabled: !meLoading && (!!me?.isClubAdmin || !!teamId),
      queryKey: getListPeopleQueryKey(summaryParams),
    },
  });
  const summary = {
    teams: teamId != null ? 1 : (clubTeams ?? []).length,
    players: summaryPeople?.filter((person) =>
      person.teamRoles.includes("player") &&
      !person.teamRoles.some((role) => role === "coach" || role === "manager"),
    ).length ?? 0,
    coaches: summaryPeople?.filter((person) =>
      person.teamRoles.some((role) => role === "coach" || role === "manager"),
    ).length ?? 0,
    parents: summaryPeople?.filter((person) =>
      person.connectedChildren.length > 0 && person.teamRoles.length === 0,
    ).length ?? 0,
  };
  const sections = [
    {
      title: "Admins & coaches",
      people: people?.filter((person) =>
        person.teamRoles.some((role) => role === "coach" || role === "manager"),
      ) ?? [],
    },
    {
      title: "Players",
      people: people?.filter(
        (person) =>
          person.teamRoles.includes("player") &&
          !person.teamRoles.some((role) => role === "coach" || role === "manager"),
      ) ?? [],
    },
    {
      title: "Parents & guardians",
      people: people?.filter(
        (person) => person.connectedChildren.length > 0 && person.teamRoles.length === 0,
      ) ?? [],
    },
  ].filter((section) => section.people.length > 0);

  return (
    <div className="flex-1 flex flex-col h-full overflow-hidden bg-muted/10">
      <div className="container mx-auto p-4 md:p-8 lg:max-w-6xl flex-1 flex flex-col h-full">
        <header className="mb-8 shrink-0 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h1 className="text-3xl font-display font-bold tracking-tight">Team Members</h1>
            <p className="text-muted-foreground mt-1">Coaches, players, and parents connected to this team.</p>
          </div>
          {canInvite && <InvitePersonDialog teamId={teamId} teams={inviteTeams} />}
        </header>

        <section
          aria-label={teamId != null ? "Team member summary" : "Club member summary"}
          data-testid="team-members-summary"
          className="mb-6 shrink-0 rounded-2xl border border-primary/15 bg-primary/[0.035] px-4 py-3"
        >
          <div className="mb-2 text-[10px] font-bold uppercase tracking-[0.14em] text-muted-foreground">
            {teamId != null ? "This team" : "Club"} · unfiltered counts
          </div>
          <div className="flex flex-wrap gap-2">
            {[
              ["Teams", summary.teams],
              ["Players", summary.players],
              ["Coaches", summary.coaches],
              ["Parents", summary.parents],
            ].map(([label, count]) => (
              <div
                key={label}
                data-testid={`summary-${String(label).toLowerCase()}`}
                className="inline-flex min-h-8 items-center gap-2 rounded-full border border-border/70 bg-background px-3 text-xs"
              >
                <span className="font-semibold text-muted-foreground">{label}</span>
                <span className="font-bold tabular-nums">
                  {summaryLoading ? <span className="inline-block h-3 w-5 animate-pulse rounded bg-muted align-middle" /> : count}
                </span>
              </div>
            ))}
          </div>
        </section>

        <div className="flex-1 overflow-y-auto overflow-x-hidden pb-8">
          {meLoading || isLoading || (isFetching && !people) ? (
            <LoadingScreen message="Loading team members..." />
          ) : error || !people ? (
            <ErrorState onRetry={() => refetch()} />
          ) : people.length === 0 ? (
            <EmptyState 
              title="No team members yet"
              message="Invite someone to start building this team."
              icon={UserSquare2}
            />
          ) : (
            <div className="space-y-6">
              {sections.map((section) => (
                <section key={section.title}>
                  <h2 className="mb-2 px-1 text-xs font-bold uppercase tracking-wider text-muted-foreground">
                    {section.title}
                  </h2>
                  <div className="bg-card border rounded-3xl shadow-sm overflow-hidden flex flex-col divide-y">
              {section.people.map(person => (
                <Link key={person.id} href={`/people/${person.id}`}>
                  <div className="p-4 md:p-6 flex flex-col sm:flex-row sm:items-center gap-4 hover:bg-muted/30 transition-colors cursor-pointer group">
                    <div className="flex min-w-0 items-center gap-4 flex-1">
                      <Avatar className="h-14 w-14 shrink-0 border shadow-sm">
                        <AvatarImage src={person.avatarUrl || undefined} />
                        <AvatarFallback className="font-bold text-lg bg-primary/10 text-primary">
                          {person.firstName?.charAt(0)}{person.lastName?.charAt(0)}
                        </AvatarFallback>
                      </Avatar>
                      <div className="flex min-w-0 flex-1 flex-col">
                        <h3 className="font-bold text-lg leading-tight group-hover:text-primary transition-colors flex flex-wrap items-center gap-2 break-words">
                          {person.fullName}
                          {person.isMinor && <Badge variant="secondary" className="text-[10px] py-0 h-4">MINOR</Badge>}
                        </h3>
                        {person.connectedChildren.length > 0 && (
                          <p className="mt-1 text-sm text-muted-foreground">
                            Parent of {person.connectedChildren.map((child) => child.fullName).join(", ")}
                          </p>
                        )}
                        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-1 text-sm text-muted-foreground">
                          {person.email && (
                            <span className="flex min-w-0 items-start"><Mail className="h-3 w-3 mr-1.5 mt-1 shrink-0 opacity-70" /><span className="min-w-0 break-all">{person.email}</span></span>
                          )}
                          {person.phone && (
                            <span className="flex min-w-0 items-start"><Phone className="h-3 w-3 mr-1.5 mt-1 shrink-0 opacity-70" /><span className="min-w-0 break-all">{person.phone}</span></span>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                </Link>
              ))}
                  </div>
                </section>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
