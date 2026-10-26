import { useGetMe, useListTeams, getListTeamsQueryKey, teamFeatures } from "@workspace/api-client-react";
import { useActiveTeam } from "./active-team";

export { teamFeatures };

export function useTeamFeatures() {
  const { activeTeamId } = useActiveTeam();
  const { data: teams, isLoading } = useListTeams({
    query: { queryKey: getListTeamsQueryKey(), staleTime: 0, refetchOnWindowFocus: true, refetchInterval: 60_000 },
  });
  const { data: me } = useGetMe();
  const featuresFor = (id: number | null | undefined) =>
    teamFeatures(teams?.find(team => team.id === id)?.ageGroup);
  const playerEligible = !!me?.memberships.some(membership =>
    membership.role === "player" &&
    (activeTeamId === null || activeTeamId === membership.teamId) &&
    featuresFor(membership.teamId).monitoring,
  );
  return { teams, isLoading, activeTeamId, featuresFor, playerEligible };
}
