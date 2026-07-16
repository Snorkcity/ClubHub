import { useState } from "react";
import { Link, useParams } from "wouter";
import { format } from "date-fns";
import { Activity, AlertTriangle, ArrowLeft, Eye } from "lucide-react";
import {
  useGetTeamMonitoring,
  getGetTeamMonitoringQueryKey,
  useGetTeam,
  getGetTeamQueryKey,
  type PlayerMonitoring,
} from "@workspace/api-client-react";
import { LoadingScreen, ErrorState, EmptyState } from "@/components/ui/states";
import { Badge } from "@/components/ui/badge";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

const WINDOWS = [
  { days: 1, label: "24h" },
  { days: 7, label: "7d" },
  { days: 14, label: "14d" },
  { days: 28, label: "28d" },
];

/** Colour for a 1–5 wellness average (higher is better). */
function wellnessTone(v: number | null | undefined): string {
  if (v == null) return "bg-muted/40 text-muted-foreground/50";
  if (v >= 3.5) return "bg-green-50 text-green-700";
  if (v >= 2.5) return "bg-amber-50 text-amber-700";
  return "bg-red-50 text-red-700 font-bold";
}

function acwrTone(v: number | null | undefined): string {
  if (v == null) return "bg-muted/40 text-muted-foreground/50";
  if (v >= 1.5 || v < 0.6) return "bg-red-50 text-red-700 font-bold";
  if (v >= 1.3 || v < 0.8) return "bg-amber-50 text-amber-700";
  return "bg-green-50 text-green-700";
}

function Cell({ value, tone, suffix }: { value: number | null | undefined; tone: string; suffix?: string }) {
  return (
    <td className="p-1">
      <div className={`rounded-lg px-2 py-2 text-center text-sm tabular-nums ${tone}`}>
        {value == null ? "–" : `${value}${suffix ?? ""}`}
      </div>
    </td>
  );
}

function FlagBadges({ player }: { player: PlayerMonitoring }) {
  if (player.flags.length === 0) return null;
  const alert = player.flags.some((f) => f.severity === "alert");
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span
          className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-bold cursor-default ${
            alert ? "bg-red-100 text-red-700" : "bg-amber-100 text-amber-700"
          }`}
        >
          {alert ? <AlertTriangle className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
          {player.flags.length}
        </span>
      </TooltipTrigger>
      <TooltipContent side="right" className="max-w-xs">
        <ul className="space-y-1">
          {player.flags.map((f, i) => (
            <li key={i} className="text-xs">
              <span className={f.severity === "alert" ? "font-bold" : ""}>
                {f.severity === "alert" ? "⚠ " : "👁 "}
                {f.message}
              </span>
            </li>
          ))}
        </ul>
      </TooltipContent>
    </Tooltip>
  );
}

export default function TeamMonitoring() {
  const params = useParams<{ teamId: string }>();
  const teamId = Number(params.teamId);
  const [windowDays, setWindowDays] = useState(7);

  const { data: team } = useGetTeam(teamId, {
    query: { queryKey: getGetTeamQueryKey(teamId) },
  });
  const { data, isLoading, error, refetch } = useGetTeamMonitoring(
    teamId,
    { window: windowDays },
    { query: { queryKey: getGetTeamMonitoringQueryKey(teamId, { window: windowDays }), refetchInterval: 60_000 } },
  );

  if (isLoading) return <LoadingScreen message="Loading monitoring data..." />;
  if (error || !data) return <ErrorState onRetry={() => refetch()} />;

  const flagged = data.players.filter((p) => p.flags.length > 0);

  return (
    <div className="flex-1 overflow-y-auto bg-muted/10">
      <div className="container mx-auto p-4 md:p-8 max-w-6xl space-y-5">
        <header>
          <Link
            href={`/teams/${teamId}`}
            className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground mb-2"
          >
            <ArrowLeft className="h-4 w-4" /> {team?.name ?? "Team"}
          </Link>
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-3xl font-display font-bold tracking-tight">Player monitoring</h1>
            <Badge variant="secondary" className="rounded-full">
              live · {format(new Date(data.generatedAt), "h:mma")}
            </Badge>
          </div>
          <p className="text-muted-foreground mt-1">
            Green = fine, amber = caution, red = concern. WATCH/ALERT badges flag drops against a player's own 28-day norm.
          </p>
        </header>

        <div className="flex items-center gap-2">
          {WINDOWS.map((w) => (
            <button
              key={w.days}
              onClick={() => setWindowDays(w.days)}
              className={`px-4 py-2 rounded-full text-sm font-semibold transition-colors ${
                windowDays === w.days
                  ? "bg-primary text-primary-foreground shadow-sm"
                  : "bg-card border text-muted-foreground hover:bg-muted"
              }`}
            >
              {w.label}
            </button>
          ))}
          {flagged.length > 0 && (
            <span className="ml-auto text-sm text-muted-foreground">
              <span className="font-bold text-foreground">{flagged.length}</span> flagged
            </span>
          )}
        </div>

        {data.players.length === 0 ? (
          <EmptyState
            title="No players on this team"
            message="Add players to the roster to start monitoring."
            icon={Activity}
          />
        ) : (
          <div className="rounded-2xl border bg-card shadow-sm overflow-x-auto">
            <table className="w-full min-w-[860px] border-collapse">
              <thead>
                <tr className="text-[11px] uppercase tracking-wider text-muted-foreground">
                  <th className="text-left p-3 sticky left-0 bg-card z-10">Player</th>
                  <th className="p-2 font-semibold">Sleep</th>
                  <th className="p-2 font-semibold">Energy</th>
                  <th className="p-2 font-semibold">Soreness</th>
                  <th className="p-2 font-semibold">Stress</th>
                  <th className="p-2 font-semibold">Mood</th>
                  <th className="p-2 font-semibold">
                    <Tooltip>
                      <TooltipTrigger className="underline decoration-dotted">Wellness</TooltipTrigger>
                      <TooltipContent>Average of all five, vs their 28-day norm</TooltipContent>
                    </Tooltip>
                  </th>
                  <th className="p-2 font-semibold">Sessions</th>
                  <th className="p-2 font-semibold">Load</th>
                  <th className="p-2 font-semibold">
                    <Tooltip>
                      <TooltipTrigger className="underline decoration-dotted">ACWR</TooltipTrigger>
                      <TooltipContent className="max-w-xs">
                        Acute:chronic workload ratio — last 7 days vs their 4-week weekly average. Sweet spot ≈ 0.8–1.3.
                      </TooltipContent>
                    </Tooltip>
                  </th>
                </tr>
              </thead>
              <tbody>
                {data.players.map((p) => (
                  <tr key={p.person.id} className="border-t">
                    <td className="p-3 sticky left-0 bg-card z-10">
                      <div className="flex items-center gap-2 min-w-[160px]">
                        <div className="min-w-0">
                          <Link
                            href={`/people/${p.person.id}`}
                            className="font-semibold text-sm hover:underline truncate block"
                          >
                            {p.person.fullName}
                          </Link>
                          <p className="text-[11px] text-muted-foreground">
                            {p.wellnessCount} check-in{p.wellnessCount === 1 ? "" : "s"}
                            {p.lastWellnessDate ? ` · last ${format(new Date(p.lastWellnessDate + "T12:00:00"), "d MMM")}` : ""}
                          </p>
                        </div>
                        <FlagBadges player={p} />
                      </div>
                    </td>
                    <Cell value={p.sleepQuality} tone={wellnessTone(p.sleepQuality)} />
                    <Cell value={p.energy} tone={wellnessTone(p.energy)} />
                    <Cell value={p.soreness} tone={wellnessTone(p.soreness)} />
                    <Cell value={p.stress} tone={wellnessTone(p.stress)} />
                    <Cell value={p.mood} tone={wellnessTone(p.mood)} />
                    <td className="p-1">
                      <div className={`rounded-lg px-2 py-2 text-center text-sm tabular-nums ${wellnessTone(p.wellnessComposite)}`}>
                        {p.wellnessComposite == null ? "–" : p.wellnessComposite}
                        {p.wellnessBaseline != null && p.wellnessComposite != null && (
                          <span className="text-[10px] opacity-70"> /{p.wellnessBaseline}</span>
                        )}
                      </div>
                    </td>
                    <td className="p-1">
                      <div className="rounded-lg px-2 py-2 text-center text-sm tabular-nums bg-muted/40">
                        {p.sessions}
                      </div>
                    </td>
                    <td className="p-1">
                      <div className="rounded-lg px-2 py-2 text-center text-sm tabular-nums bg-muted/40">
                        {p.windowLoad}
                      </div>
                    </td>
                    <Cell value={p.acwr} tone={acwrTone(p.acwr)} />
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <p className="text-xs text-muted-foreground">
          Wellness cells show the {windowDays === 1 ? "24-hour" : `${windowDays}-day`} average on a 1–5 scale
          (higher is better). Load = RPE × minutes (sRPE). Flags compare each player against their own 28-day
          baseline — thresholds are a draft pending physio review.
        </p>

        <details className="rounded-2xl border border-border bg-card group">
          <summary className="cursor-pointer select-none px-4 py-3 font-display font-semibold text-sm flex items-center justify-between">
            How to read this board
            <span className="text-muted-foreground text-xs font-normal group-open:hidden">tap to expand</span>
          </summary>
          <div className="px-4 pb-4 space-y-3 text-sm text-muted-foreground">
            <div>
              <p className="font-semibold text-foreground">Two different signals</p>
              <p>
                <span className="font-medium text-foreground">Cell colours</span> show a player's current state
                (green = fine, amber = caution, red = concern).{" "}
                <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-1.5 py-0.5 text-[11px] font-bold text-amber-700 align-middle">
                  <Eye className="h-3 w-3" /> WATCH
                </span>{" "}
                and{" "}
                <span className="inline-flex items-center gap-1 rounded-full bg-red-100 px-1.5 py-0.5 text-[11px] font-bold text-red-700 align-middle">
                  <AlertTriangle className="h-3 w-3" /> ALERT
                </span>{" "}
                <span className="font-medium text-foreground">badges</span> show <em>change</em> — the player
                has dropped below what's normal <em>for them</em>. Every player has their own "normal": one
                might always answer 3s, another always 5s. So a badge can appear even when the cells are still
                green — the score isn't bad yet, but it's unusually low for that player, and that's worth a
                check-in.
              </p>
            </div>
            <div>
              <p className="font-semibold text-foreground">Read the two halves together</p>
              <ul className="list-disc pl-5 space-y-1">
                <li>
                  <span className="text-foreground">High load + wellness steady</span> — working hard and coping.
                  No action needed.
                </li>
                <li>
                  <span className="text-foreground">High load + wellness dropping</span> — classic overload
                  pattern. Consider easing their next few sessions.
                </li>
                <li>
                  <span className="text-foreground">Normal load + wellness dropping</span> — the cause is likely
                  off the pitch: sleep, school, growth, something at home.
                </li>
                <li>
                  <span className="text-foreground">ACWR above ~1.3</span> — this week's workload is spiking well
                  beyond their recent norm, which is when injury risk climbs.
                </li>
              </ul>
            </div>
            <div>
              <p className="font-semibold text-foreground">Talking to the player</p>
              <p>
                The board flags, the conversation diagnoses. Don't lead with the numbers — open with
                "how are you travelling this week?" and let them tell you. Use the specific red item (sleep,
                soreness, mood) to guide your questions, not as an accusation. A flag is a prompt to check in,
                never a verdict.
              </p>
            </div>
          </div>
        </details>
      </div>
    </div>
  );
}
