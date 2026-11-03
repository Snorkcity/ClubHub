import { useEffect, useMemo, useState } from "react";
import { Link } from "wouter";
import { ArrowLeft, CalendarDays, RefreshCw, Users } from "lucide-react";
import {
  getGetMeQueryKey, getGetTeamAttendanceQueryKey, getListTeamsQueryKey,
  useGetMe, useGetTeamAttendance, useListTeams,
} from "@workspace/api-client-react";
import type { Team } from "@workspace/api-client-react";
import { LoadingScreen, ErrorState } from "@/components/ui/states";
import { Button } from "@/components/ui/button";

type Filters = { teamId: number; from: string; to: string; type: "all" | "training" | "game" };
const localDate = (date: Date) => {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
};
const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;

export default function AttendanceReport() {
  const today = localDate(new Date());
  const yearStart = `${today.slice(0, 4)}-01-01`;
  const { data: me, isLoading: meLoading, error: meError, refetch: refetchMe } =
    useGetMe({ query: { queryKey: getGetMeQueryKey() } });
  const isAdmin = me?.isClubAdmin === true;
  const isCoach = !!me?.memberships.some((membership) => membership.role === "coach");
  const adminTeamsQuery = useListTeams({
    query: { queryKey: getListTeamsQueryKey(), enabled: isAdmin, staleTime: 30_000 },
  });
  const coachTeams = useMemo(() => {
    const memberships = me?.memberships.filter((membership) => membership.role === "coach") ?? [];
    const unique = new Map<number, Team>();
    memberships.forEach((membership) => unique.set(membership.teamId, {
      id: membership.teamId, name: membership.teamName, ageGroup: "", gender: null,
      colorHex: null, seasonId: null, seasonName: null, playerCount: 0, staffCount: 0,
    }));
    return [...unique.values()];
  }, [me?.memberships]);
  const teams = isAdmin ? (adminTeamsQuery.data ?? []) : coachTeams;
  const permitted = isAdmin || isCoach;
  const firstTeamId = teams[0]?.id ?? 0;
  const [draft, setDraft] = useState<Filters>({ teamId: 0, from: yearStart, to: today, type: "all" });
  const [applied, setApplied] = useState<Filters | null>(null);

  useEffect(() => {
    if (firstTeamId && !teams.some((team) => team.id === draft.teamId)) {
      setDraft((current) => ({ ...current, teamId: firstTeamId }));
    }
  }, [firstTeamId, teams, draft.teamId]);

  const reportParams = applied
    ? { from: applied.from, to: applied.to, timeZone, type: applied.type }
    : { from: yearStart, to: today, timeZone, type: "all" as const };
  const reportTeamId = applied?.teamId ?? 0;
  const reportQuery = useGetTeamAttendance(reportTeamId, reportParams, {
    query: {
      queryKey: getGetTeamAttendanceQueryKey(reportTeamId, reportParams),
      enabled: permitted && reportTeamId > 0 && !!applied,
      refetchOnWindowFocus: true,
    },
  });

  if (meLoading || (isAdmin && adminTeamsQuery.isLoading)) return <LoadingScreen message="Loading attendance..." />;
  if (meError || !me) return <ErrorState onRetry={() => refetchMe()} />;
  if (!permitted) return <AccessDenied />;
  if (isAdmin && adminTeamsQuery.error) return <ErrorState onRetry={() => void adminTeamsQuery.refetch()} />;

  const isDraftDifferent = !!applied && (
    draft.teamId !== applied.teamId || draft.from !== applied.from || draft.to !== applied.to || draft.type !== applied.type
  );
  const appliedTeamIsAvailable = !!applied && teams.some((team) => team.id === applied.teamId);
  const visibleReport = isDraftDifferent || !appliedTeamIsAvailable ? undefined : reportQuery.data;
  const run = () => {
    if (draft.teamId && draft.from && draft.to && draft.from <= draft.to) {
      if (applied && !isDraftDifferent) void reportQuery.refetch();
      else setApplied({ ...draft });
    }
  };

  return (
    <div className="flex-1 overflow-y-auto bg-muted/10">
      <div className="container mx-auto max-w-4xl p-4 md:p-8">
        <Link href="/reports" className="mb-4 inline-flex min-h-10 items-center gap-1 rounded-lg px-2 text-sm font-semibold text-muted-foreground hover:bg-muted hover:text-foreground">
          <ArrowLeft className="h-4 w-4" /> Reports
        </Link>
        <header className="mb-6">
          <p className="text-xs font-bold uppercase tracking-[0.16em] text-primary">Team report</p>
          <h1 className="mt-1 font-display text-3xl font-bold tracking-tight">RSVP attendance</h1>
          <p className="mt-1 text-sm text-muted-foreground">A response record for completed training and games.</p>
        </header>

        <section className="rounded-2xl border bg-card p-4 shadow-sm md:p-5" aria-label="Report filters">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-[1.2fr_1fr_1fr_1fr_auto] lg:items-end">
            <label className="space-y-1.5 text-sm font-semibold">
              <span>Team</span>
              <select data-testid="select-attendance-team" value={draft.teamId}
                onChange={(event) => setDraft({ ...draft, teamId: Number(event.target.value) })}
                className="h-11 w-full rounded-xl border bg-background px-3">
                {teams.map((team) => <option key={team.id} value={team.id}>{team.name}</option>)}
              </select>
            </label>
            <label className="space-y-1.5 text-sm font-semibold">
              <span>From</span><input data-testid="input-attendance-from" type="date" value={draft.from}
                onChange={(event) => setDraft({ ...draft, from: event.target.value })}
                className="h-11 w-full rounded-xl border bg-background px-3" />
            </label>
            <label className="space-y-1.5 text-sm font-semibold">
              <span>To</span><input data-testid="input-attendance-to" type="date" value={draft.to}
                onChange={(event) => setDraft({ ...draft, to: event.target.value })}
                className="h-11 w-full rounded-xl border bg-background px-3" />
            </label>
            <label className="space-y-1.5 text-sm font-semibold">
              <span>Sessions</span><select data-testid="select-attendance-type" value={draft.type}
                onChange={(event) => setDraft({ ...draft, type: event.target.value as Filters["type"] })}
                className="h-11 w-full rounded-xl border bg-background px-3">
                <option value="all">Training + games</option><option value="training">Training</option><option value="game">Games</option>
              </select>
            </label>
            <Button data-testid="button-run-attendance-report" onClick={run} disabled={!draft.teamId || !draft.from || !draft.to || draft.from > draft.to}
              className="h-11 rounded-xl font-bold">
              <RefreshCw className="mr-2 h-4 w-4" /> Run report
            </Button>
          </div>
          <p className="mt-3 text-xs text-muted-foreground">Dates use your local calendar ({timeZone}).</p>
        </section>

        {!teams.length ? (
          <div className="mt-5 rounded-2xl border border-dashed bg-card p-6 text-center">
            <Users className="mx-auto h-6 w-6 text-muted-foreground" />
            <p className="mt-2 font-semibold">No teams available</p>
            <p className="mt-1 text-sm text-muted-foreground">There are no current teams in this club to report on.</p>
          </div>
        ) : !applied ? (
          <div className="mt-5 rounded-2xl border border-dashed bg-card p-6 text-center text-sm text-muted-foreground">
            Choose a team and date range, then run the report.
          </div>
        ) : !appliedTeamIsAvailable ? (
          <div className="mt-5 rounded-2xl border border-amber-300/60 bg-amber-50/70 p-4 text-sm text-amber-950">
            Your available teams have changed. Select a current team and run the report again.
          </div>
        ) : isDraftDifferent ? (
          <div className="mt-5 rounded-2xl border border-amber-300/60 bg-amber-50/70 p-4 text-sm text-amber-950">
            Filters have changed. Run the report to show results for these dates and this team.
          </div>
        ) : reportQuery.isLoading ? (
          <ReportSkeleton />
        ) : reportQuery.error ? (
          <div role="alert" className="mt-5 rounded-2xl border border-destructive/30 bg-card p-5">
            <p className="font-semibold">Could not load this report.</p>
            <Button variant="outline" className="mt-3 rounded-xl" onClick={() => void reportQuery.refetch()}>Try again</Button>
          </div>
        ) : visibleReport ? (
          <section className="mt-5 space-y-4" aria-label="Attendance report results">
            <div className="flex flex-wrap items-end justify-between gap-2">
              <div>
                <h2 className="font-display text-xl font-bold">{visibleReport.teamName}</h2>
                <p className="text-sm text-muted-foreground">{visibleReport.from} – {visibleReport.to} · {visibleReport.totalSessions} sessions</p>
              </div>
              <button type="button" data-testid="button-refresh-attendance-report" onClick={() => void reportQuery.refetch()}
                className="inline-flex min-h-10 items-center gap-2 rounded-xl border bg-card px-3 text-sm font-semibold hover:bg-muted">
                <RefreshCw className="h-4 w-4" /> Refresh
              </button>
            </div>
            <div role="note" data-testid="notice-attendance-report" className="rounded-xl border border-primary/20 bg-primary/[0.045] p-4 text-sm leading-relaxed">
              <span className="font-bold">How to read this report</span>
              <p className="mt-1">RSVP-based, not verified attendance. Check and correct records before using these figures in player feedback. No response is not a confirmed absence.</p>
              <details className="mt-2 text-muted-foreground">
                <summary className="cursor-pointer font-semibold">How calculations work</summary>
                <p className="mt-2">{visibleReport.notice}</p>
              </details>
            </div>
            {visibleReport.totalSessions === 0 ? (
              <div className="rounded-2xl border border-dashed bg-card p-6 text-center">
                <CalendarDays className="mx-auto h-6 w-6 text-muted-foreground" />
                <p className="mt-2 font-semibold">No eligible sessions in this range</p>
                <p className="mt-1 text-sm text-muted-foreground">Try a wider date range or another session type.</p>
              </div>
            ) : (
              <div className="overflow-hidden rounded-2xl border bg-card">
                <div className="hidden grid-cols-[minmax(0,1fr)_repeat(4,minmax(6.5rem,auto))] gap-3 border-b bg-muted/40 px-4 py-3 text-[11px] font-bold uppercase tracking-wide text-muted-foreground sm:grid">
                  <span>Player</span><span>Going</span><span>Not going</span><span>Maybe</span><span>No response</span>
                </div>
                <div className="divide-y">
                  {visibleReport.players.map((player) => (
                    <article key={player.personId} data-testid={`row-attendance-player-${player.personId}`} className="grid gap-2 px-4 py-3 sm:grid-cols-[minmax(0,1fr)_repeat(4,minmax(6.5rem,auto))] sm:items-center">
                      <div className="font-semibold">{player.fullName}</div>
                      <Metric label="Going" value={`${player.going}/${player.totalSessions}`} detail={player.goingPercent == null ? "—" : `${player.goingPercent}%`} />
                      <Metric label="Not going" value={player.out} />
                      <Metric label="Maybe" value={player.maybe} />
                      <Metric label="No response" value={player.noResponse} />
                    </article>
                  ))}
                  {visibleReport.players.length === 0 && <p className="p-6 text-center text-sm text-muted-foreground">No current players to show.</p>}
                </div>
              </div>
            )}
            <p className="text-right text-xs text-muted-foreground">Updated {new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(new Date(visibleReport.generatedAt))}</p>
          </section>
        ) : null}
      </div>
    </div>
  );
}

function Metric({ label, value, detail }: { label: string; value: string | number; detail?: string }) {
  return <div className="flex items-center justify-between gap-3 text-sm sm:block sm:text-right">
    <span className="text-xs text-muted-foreground sm:hidden">{label}</span>
    <span className="font-semibold tabular-nums">{value} {detail && <span className="ml-1 text-xs font-medium text-muted-foreground">{detail}</span>}</span>
  </div>;
}

function ReportSkeleton() {
  return <div aria-label="Loading report" className="mt-5 space-y-3">
    <div className="h-8 w-52 animate-pulse rounded-lg bg-muted" />
    {[0, 1, 2, 3].map((row) => <div key={row} className="h-14 animate-pulse rounded-xl bg-muted/80" />)}
  </div>;
}

function AccessDenied() {
  return <div className="mx-auto max-w-xl p-6 md:p-10"><div className="rounded-2xl border bg-card p-6">
    <h1 className="font-display text-xl font-bold">Attendance reports are for coaches and club admins</h1>
    <p className="mt-2 text-sm text-muted-foreground">Team manager access does not include this report.</p>
    <Link href="/reports" className="mt-4 inline-flex min-h-10 items-center text-sm font-semibold text-primary">Back to reports</Link>
  </div></div>;
}
