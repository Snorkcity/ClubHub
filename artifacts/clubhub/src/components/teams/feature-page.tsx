import type { ReactNode } from "react";
import { Link, useParams } from "wouter";
import { useGetEvent, useGetTeam, getGetEventQueryKey, getGetTeamQueryKey, teamFeatures } from "@workspace/api-client-react";
import { LoadingScreen, ErrorState } from "@/components/ui/states";

/** Don't mount restricted pages (or their data requests) from old/direct links. */
export function FeaturePage({
  feature, children,
}: {
  feature: "monitoring" | "timekeeping"; children: ReactNode;
}) {
  const params = useParams<{ teamId?: string; eventId?: string }>();
  const eventId = Number(params.eventId);
  const event = useGetEvent(eventId, { query: { enabled: eventId > 0, queryKey: getGetEventQueryKey(eventId) } });
  const teamId = Number(params.teamId) || event.data?.event.teamId || 0;
  const team = useGetTeam(teamId, { query: { enabled: teamId > 0, queryKey: getGetTeamQueryKey(teamId), refetchInterval: 60_000 } });
  if ((eventId > 0 && event.isLoading) || !teamId && !event.isError || team.isLoading)
    return <LoadingScreen message="Checking team features..." />;
  if (event.isError || team.isError || !team.data)
    return <ErrorState onRetry={() => void (eventId > 0 ? event.refetch() : team.refetch())} />;
  if (!teamFeatures(team.data.ageGroup)[feature]) {
    return <div className="mx-auto w-full max-w-xl space-y-4 p-6">
      <h1 className="text-xl font-bold">Not available for this team</h1>
      <p className="text-muted-foreground">
        {!teamFeatures(team.data.ageGroup).classified
          ? "A team admin needs to confirm this team's age group."
          : feature === "monitoring"
            ? "RPE and wellness start at U14."
            : "Junior match timekeeping is available through U17 only."}
      </p>
      <Link className="inline-block rounded-xl border px-4 py-3 font-semibold" href={`/teams/${teamId}`}>Back to team</Link>
    </div>;
  }
  return children;
}
