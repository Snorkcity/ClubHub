import { useParams, Link } from "wouter";
import { ArrowLeft, Timer } from "lucide-react";
import {
  useGetSeasonMinutes,
  getGetSeasonMinutesQueryKey,
  useGetTeam,
  getGetTeamQueryKey,
} from "@workspace/api-client-react";

import { LoadingScreen, ErrorState, EmptyState } from "@/components/ui/states";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";

function fmtMinutes(totalSeconds: number): string {
  return `${Math.round(totalSeconds / 60)}`;
}

export default function TeamMinutes() {
  const params = useParams();
  const teamId = Number(params.teamId);

  const { data: team } = useGetTeam(teamId, {
    query: { enabled: !!teamId, queryKey: getGetTeamQueryKey(teamId) },
  });
  const { data, isLoading, error, refetch } = useGetSeasonMinutes(teamId, {
    query: { enabled: !!teamId, queryKey: getGetSeasonMinutesQueryKey(teamId) },
  });

  if (isLoading) return <LoadingScreen message="Loading season minutes..." />;
  if (error || !data) return <ErrorState onRetry={() => refetch()} />;

  const maxSeconds = Math.max(1, ...data.players.map((p) => p.totalSeconds));

  return (
    <div className="flex-1 overflow-y-auto bg-muted/10">
      <div className="container mx-auto p-4 md:p-8 lg:max-w-3xl space-y-4">
        <Link
          href={`/teams/${teamId}`}
          className="inline-flex items-center text-sm font-semibold text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="h-4 w-4 mr-1" /> Back to team
        </Link>

        <div>
          <h1 className="text-2xl md:text-3xl font-display font-bold">
            Season minutes
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            {team?.name ? `${team.name} — ` : ""}
            game time tracked across {data.trackedGames}{" "}
            {data.trackedGames === 1 ? "game" : "games"}
          </p>
        </div>

        <div className="bg-card border rounded-3xl overflow-hidden shadow-sm divide-y">
          {data.players.map((p) => (
            <div key={p.person.id} className="flex items-center gap-3 p-3">
              <Avatar className="h-10 w-10 border shrink-0">
                <AvatarImage src={p.person.avatarUrl || undefined} />
                <AvatarFallback>{p.person.firstName?.charAt(0)}</AvatarFallback>
              </Avatar>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  {p.jerseyNumber != null && (
                    <span className="text-xs font-bold text-muted-foreground tabular-nums">
                      #{p.jerseyNumber}
                    </span>
                  )}
                  <span className="font-semibold text-sm truncate">
                    {p.person.fullName}
                  </span>
                </div>
                <div className="h-1.5 bg-muted rounded-full mt-1.5 overflow-hidden">
                  <div
                    className="h-full bg-primary rounded-full"
                    style={{ width: `${(p.totalSeconds / maxSeconds) * 100}%` }}
                  />
                </div>
              </div>
              <div className="text-right shrink-0 w-20">
                <div className="font-display font-bold tabular-nums">
                  {fmtMinutes(p.totalSeconds)}
                  <span className="text-xs font-normal text-muted-foreground"> min</span>
                </div>
                <div className="text-xs text-muted-foreground tabular-nums">
                  {p.gamesPlayed} {p.gamesPlayed === 1 ? "game" : "games"}
                </div>
              </div>
            </div>
          ))}
          {data.players.length === 0 && (
            <EmptyState
              title="No minutes tracked yet"
              message="Open a game and use Track game time to start recording minutes."
              icon={Timer}
            />
          )}
        </div>
      </div>
    </div>
  );
}
