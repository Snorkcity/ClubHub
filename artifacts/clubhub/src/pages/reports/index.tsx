import { Link } from "wouter";
import { BarChart3, ChevronRight, TrendingUp } from "lucide-react";
import { useGetMe, getGetMeQueryKey, useListTeams, getListTeamsQueryKey } from "@workspace/api-client-react";
import { useActiveTeam } from "@/lib/active-team";
import { LoadingScreen, ErrorState } from "@/components/ui/states";

export default function Reports() {
  const { data: me, isLoading, error, refetch } = useGetMe({ query: { queryKey: getGetMeQueryKey() } });
  const { activeTeamId } = useActiveTeam();
  const adminTeams = useListTeams({ query: { queryKey: getListTeamsQueryKey(), enabled: me?.isClubAdmin === true } });
  if (isLoading) return <LoadingScreen message="Loading reports..." />;
  if (error || !me) return <ErrorState onRetry={() => refetch()} />;
  if (me.isClubAdmin && adminTeams.isLoading) return <LoadingScreen message="Loading teams..." />;
  if (me.isClubAdmin && adminTeams.error) return <ErrorState onRetry={() => void adminTeams.refetch()} />;

  const isCoach = me.memberships.some((membership) => membership.role === "coach");
  const isStaffOrAdmin = me.isClubAdmin || me.memberships.some((membership) =>
    membership.role === "coach" || membership.role === "manager");
  if (!isStaffOrAdmin) {
    return <div className="mx-auto max-w-xl p-6 md:p-10"><div className="rounded-2xl border bg-card p-6">
      <h1 className="font-display text-xl font-bold">Reports are for team staff</h1>
      <p className="mt-2 text-sm text-muted-foreground">Ask a coach or club admin if you need a team report.</p>
    </div></div>;
  }

  const staffMemberships = me.memberships.filter((membership) =>
    membership.role === "coach" || membership.role === "manager");
  const feedbackTeams = me.isClubAdmin
    ? (adminTeams.data ?? []).map((team) => ({ teamId: team.id, teamName: team.name }))
    : [...new Map(staffMemberships.map((membership) => [membership.teamId, membership])).values()];
  const scopedFeedbackTeams = activeTeamId == null
    ? feedbackTeams
    : feedbackTeams.filter((membership) => membership.teamId === activeTeamId);
  return (
    <div className="flex-1 overflow-y-auto bg-muted/10">
      <div className="container mx-auto max-w-3xl p-4 md:p-8">
        <header className="mb-6">
          <p className="text-xs font-bold uppercase tracking-[0.16em] text-primary">Team tools</p>
          <h1 className="mt-1 font-display text-3xl font-bold tracking-tight">Reports</h1>
          <p className="mt-1 text-sm text-muted-foreground">A clear view of how your team is doing.</p>
        </header>
        <div className="space-y-3">
          {scopedFeedbackTeams.map((team) => (
            <Link key={team.teamId} href={`/teams/${team.teamId}/development`} data-testid={`link-player-feedback-report-${team.teamId}`}
              className="group flex min-h-24 items-center gap-4 rounded-2xl border bg-card p-4 shadow-sm transition-colors hover:border-primary/35 hover:bg-primary/[0.025]">
              <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                <TrendingUp className="h-5 w-5" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block font-bold">Player Feedback</span>
                <span className="mt-0.5 block text-sm text-muted-foreground">Review development cycles for {team.teamName}.</span>
              </span>
              <ChevronRight className="h-5 w-5 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
            </Link>
          ))}
          {isCoach || me.isClubAdmin ? (
            <Link href="/reports/attendance" data-testid="link-attendance-report"
              className="group flex min-h-24 items-center gap-4 rounded-2xl border bg-card p-4 shadow-sm transition-colors hover:border-primary/35 hover:bg-primary/[0.025]">
              <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-emerald-600/10 text-emerald-700">
                <BarChart3 className="h-5 w-5" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block font-bold">RSVP attendance</span>
                <span className="mt-0.5 block text-sm text-muted-foreground">See player responses across completed sessions.</span>
              </span>
              <ChevronRight className="h-5 w-5 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
            </Link>
          ) : null}
          {scopedFeedbackTeams.length === 0 && !isCoach && !me.isClubAdmin && (
            <div className="rounded-2xl border border-dashed bg-card p-5 text-sm text-muted-foreground">
              No team reports are available for your current role.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
