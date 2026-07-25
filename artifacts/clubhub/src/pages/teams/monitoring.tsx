import { useState } from "react";
import { Link, useParams } from "wouter";
import { format } from "date-fns";
import { Activity, AlertTriangle, ArrowLeft, ChevronDown, Eye } from "lucide-react";
import {
  useGetTeamMonitoring,
  getGetTeamMonitoringQueryKey,
  useGetTeam,
  getGetTeamQueryKey,
  type PlayerMonitoring,
} from "@workspace/api-client-react";
import { LoadingScreen, ErrorState, EmptyState } from "@/components/ui/states";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
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

/** Higher = more concerning; used to float the reddest players to the top. */
function severityScore(p: PlayerMonitoring): number {
  let score = 0;
  const bucket = (v: number | null | undefined) => (v == null ? 0 : v < 2.5 ? 2 : v < 3.5 ? 1 : 0);
  for (const e of WELLNESS_ELEMENTS) score += bucket(p[e.key] as number | null);
  score += bucket(p.wellnessComposite) * 2; // overall wellness weighs double
  if (p.acwr != null) {
    if (p.acwr >= 1.5 || p.acwr < 0.6) score += 4;
    else if (p.acwr >= 1.3 || p.acwr < 0.8) score += 2;
  }
  for (const f of p.flags) score += f.severity === "alert" ? 3 : 1;
  return score;
}

/** Plain-English context for a raw sRPE load number. */
function loadContext(p: PlayerMonitoring): string {
  const perSession = p.sessions > 0 ? Math.round(p.windowLoad / p.sessions) : null;
  const base =
    "Load = how hard the session felt (1–10) × minutes. A tough 90-minute session lands around 600–700; a light one nearer 200–300.";
  if (perSession == null) return base;
  return `${base} This player is averaging ≈${perSession} per session, so skipping one takes roughly that much off their week.`;
}

type TrafficLight = "red" | "amber" | "green" | "none";

/** One overall traffic light per player — the worst of wellness, ACWR and flags. */
function overallLight(p: PlayerMonitoring): TrafficLight {
  const buckets: TrafficLight[] = [];
  const wb = (v: number | null | undefined): TrafficLight =>
    v == null ? "none" : v < 2.5 ? "red" : v < 3.5 ? "amber" : "green";
  buckets.push(wb(p.wellnessComposite));
  if (p.acwr != null) {
    buckets.push(p.acwr >= 1.5 || p.acwr < 0.6 ? "red" : p.acwr >= 1.3 || p.acwr < 0.8 ? "amber" : "green");
  }
  if (p.flags.some((f) => f.severity === "alert")) buckets.push("red");
  else if (p.flags.length > 0) buckets.push("amber");
  if (buckets.includes("red")) return "red";
  if (buckets.includes("amber")) return "amber";
  if (buckets.includes("green")) return "green";
  return "none";
}

const LIGHT_TILE: Record<TrafficLight, string> = {
  red: "bg-red-50 border-red-200 hover:border-red-400",
  amber: "bg-amber-50 border-amber-200 hover:border-amber-400",
  green: "bg-green-50 border-green-200 hover:border-green-400",
  none: "bg-muted/30 border-border hover:border-foreground/20",
};
const LIGHT_DOT: Record<TrafficLight, string> = {
  red: "bg-red-500",
  amber: "bg-amber-500",
  green: "bg-green-500",
  none: "bg-muted-foreground/30",
};

/** Personalised opener the coach can use with this player. */
function conversationGuide(p: PlayerMonitoring): string {
  const light = overallLight(p);
  const firstName = p.person.fullName.split(" ")[0];
  const scored = WELLNESS_ELEMENTS
    .map((e) => ({ label: e.label.toLowerCase(), value: p[e.key] as number | null }))
    .filter((e): e is { label: string; value: number } => e.value != null);
  const worst = [...scored].sort((a, b) => a.value - b.value)[0];
  const loadHigh = p.acwr != null && p.acwr >= 1.3;
  const loadLow = p.acwr != null && p.acwr < 0.8;

  if (light === "none")
    return `No recent check-ins from ${firstName}. A casual "have you seen the check-in thing?" is the only conversation needed here.`;
  if (light === "green")
    return `${firstName} looks in good shape — nothing to raise. A quick "you're travelling well" goes a long way for buy-in.`;
  if (loadHigh && worst && worst.value < 3.5)
    return `Double signal for ${firstName}: workload has spiked AND ${worst.label} is down. Open with "big week — how's the body holding up?" and consider trimming their next session rather than asking them to push through.`;
  if (loadHigh)
    return `${firstName}'s wellness is holding but their workload has jumped. Ask what else they've played this week (school, rep) — the risk is what you can't see on your own training plan.`;
  if (loadLow)
    return `${firstName} has trained much less than usual. If it's planned rest, fine — if not, ask "missed you this week, everything OK?" and rebuild gradually rather than straight back to full load.`;
  if (worst && worst.value < 2.5)
    return `The flag for ${firstName} is ${worst.label}. Don't lead with the number — open with "how are you travelling this week?" and steer gently toward ${
      worst.label === "sleep" ? "how they're sleeping" :
      worst.label === "stress" ? "school/home pressure" :
      worst.label === "soreness" ? "where they're sore and since when" :
      worst.label === "energy" ? "whether they're eating and recovering enough" :
      "how things are going off the pitch"
    }.`;
  if (worst)
    return `${firstName} is a touch below par (${worst.label} is the softest). Nothing urgent — a casual check-in at training is enough, and watch whether next week's numbers recover.`;
  return `Check in casually with ${firstName} and keep an eye on next week's trend.`;
}

const WELLNESS_ELEMENTS = [
  { key: "sleepQuality", label: "Sleep" },
  { key: "energy", label: "Energy" },
  { key: "soreness", label: "Soreness" },
  { key: "stress", label: "Stress" },
  { key: "mood", label: "Mood" },
] as const;

/** One-sentence explanation of what's dragging the wellness score down. */
function wellnessExplanation(p: PlayerMonitoring): string {
  const scored = WELLNESS_ELEMENTS
    .map((e) => ({ label: e.label, value: p[e.key] as number | null }))
    .filter((e) => e.value != null) as { label: string; value: number }[];
  if (scored.length === 0) return "No wellness check-ins in this window yet.";
  const red = scored.filter((e) => e.value < 2.5).map((e) => e.label.toLowerCase());
  const amber = scored.filter((e) => e.value >= 2.5 && e.value < 3.5).map((e) => e.label.toLowerCase());
  const listWords = (arr: string[]) =>
    arr.length === 1 ? arr[0] : `${arr.slice(0, -1).join(", ")} and ${arr[arr.length - 1]}`;
  if (red.length > 0) {
    return `The concern here is mainly coming from ${listWords(red)}${
      amber.length > 0 ? `, with ${listWords(amber)} also below par` : ""
    }. Worth a quiet check-in about that specifically.`;
  }
  if (amber.length > 0) {
    return `Nothing is in the red, but ${listWords(amber)} ${amber.length === 1 ? "is" : "are"} a bit below par this week — keep an eye on it.`;
  }
  const belowBaseline =
    p.wellnessBaseline != null && p.wellnessComposite != null && p.wellnessComposite < p.wellnessBaseline - 0.4;
  if (belowBaseline) {
    return `All five elements look fine on their own, but the overall score is lower than this player's usual — something may be slipping.`;
  }
  return "All five elements look fine — nothing needs attention right now.";
}

/** One-sentence explanation of the ACWR colour. */
function acwrExplanation(p: PlayerMonitoring): string {
  if (p.acwr == null)
    return "Not enough training history yet to compare this week against their 4-week norm.";
  if (p.acwr >= 1.5)
    return `This week's load (${p.acuteLoad}) is well above their usual week (≈${Math.round(p.chronicWeeklyLoad ?? 0)}) — a sharp spike like this is when injury risk climbs. Consider easing their next session or two.`;
  if (p.acwr >= 1.3)
    return `This week's load (${p.acuteLoad}) is running above their usual week (≈${Math.round(p.chronicWeeklyLoad ?? 0)}). Not alarming yet, but avoid stacking more heavy sessions on top.`;
  if (p.acwr < 0.6)
    return `This week's load (${p.acuteLoad}) is far below their usual week (≈${Math.round(p.chronicWeeklyLoad ?? 0)}). A sudden return to full training from here is its own risk — build back up gradually.`;
  if (p.acwr < 0.8)
    return `This week's load (${p.acuteLoad}) is a bit lighter than their usual week (≈${Math.round(p.chronicWeeklyLoad ?? 0)}) — fine if it's planned recovery, worth asking about if not.`;
  return `This week's load (${p.acuteLoad}) is in line with their usual week (≈${Math.round(p.chronicWeeklyLoad ?? 0)}) — right in the sweet spot.`;
}

/** One short sentence comparing this player's week against the squad. */
function squadLoadContext(p: PlayerMonitoring, players: PlayerMonitoring[]): string | null {
  const loads = players.map((x) => x.acuteLoad ?? 0).filter((v) => v > 0);
  if (loads.length < 3) return null;
  const avg = Math.round(loads.reduce((a, b) => a + b, 0) / loads.length);
  if (avg <= 0) return null;
  const ratio = (p.acuteLoad ?? 0) / avg;
  const firstName = p.person.fullName.split(" ")[0];
  const rel =
    ratio >= 1.25 ? `well above that (${ratio.toFixed(1)}×)`
    : ratio >= 1.1 ? `a bit above that (${ratio.toFixed(1)}×)`
    : ratio > 0.9 ? "right around that"
    : ratio > 0.75 ? `a bit below that (${ratio.toFixed(1)}×)`
    : ratio > 0 ? `well below that (${ratio.toFixed(1)}×)`
    : "at zero";
  return `Squad average this week is ≈${avg} — ${firstName} is ${rel}.`;
}

function WeeklyHistoryBlock({ p, compact }: { p: PlayerMonitoring; compact?: boolean }) {
  const weeks = p.weeklyHistory ?? [];
  if (weeks.length === 0) return null;
  const maxLoad = Math.max(...weeks.map((w) => w.load), 1);
  return (
    <div className={compact ? "text-xs" : "text-sm"}>
      <div className="font-bold text-[10px] uppercase tracking-wider text-muted-foreground mb-1.5">
        Last 4 weeks
      </div>
      <div className="space-y-1.5">
        {weeks.map((w, i) => {
          const isCurrent = i === weeks.length - 1;
          return (
            <div key={w.weekStart} className="flex items-center gap-2">
              <span className={`w-14 shrink-0 tabular-nums ${isCurrent ? "font-semibold text-foreground" : "text-muted-foreground"}`}>
                {isCurrent ? "This wk" : format(new Date(w.weekStart + "T12:00:00"), "d MMM")}
              </span>
              <div className="flex-1 h-4 rounded bg-muted/50 overflow-hidden">
                <div
                  className={`h-full rounded ${isCurrent ? "bg-primary" : "bg-primary/40"}`}
                  style={{ width: `${Math.round((w.load / maxLoad) * 100)}%` }}
                />
              </div>
              <span className="w-12 shrink-0 text-right tabular-nums font-semibold">{w.load || "–"}</span>
              <span className={`w-16 shrink-0 text-right tabular-nums ${wellnessTone(w.wellnessAvg).includes("red") ? "text-red-600 font-semibold" : "text-muted-foreground"}`}>
                {w.wellnessAvg == null ? "– " : `${w.wellnessAvg}/5`}
              </span>
            </div>
          );
        })}
      </div>
      <div className="flex justify-end gap-2 mt-1 text-[10px] uppercase tracking-wide text-muted-foreground">
        <span>load</span>
        <span>· wellness</span>
      </div>
    </div>
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

/** Mobile card: two big tappable scores; tap opens the breakdown + a plain-English sentence. */
function windowLabel(days: number): string {
  return days === 1 ? "24-hour" : `${days}-day`;
}

function PlayerCard({ p, windowDays, squadNote }: { p: PlayerMonitoring; windowDays: number; squadNote: string | null }) {
  const [open, setOpen] = useState<"wellness" | "acwr" | null>(null);
  const toggle = (which: "wellness" | "acwr") => setOpen((o) => (o === which ? null : which));

  return (
    <div className="rounded-2xl border bg-card shadow-sm overflow-hidden">
      <div className="p-3 flex items-center gap-2">
        <div className="min-w-0 flex-1">
          <Link href={`/people/${p.person.id}`} className="font-semibold text-sm hover:underline truncate block">
            {p.person.fullName}
          </Link>
          <p className="text-[11px] text-muted-foreground">
            {p.wellnessCount} check-in{p.wellnessCount === 1 ? "" : "s"}
            {p.lastWellnessDate ? ` · last ${format(new Date(p.lastWellnessDate + "T12:00:00"), "d MMM")}` : ""}
          </p>
        </div>
        <FlagBadges player={p} />
      </div>

      <div className="grid grid-cols-2 gap-2 px-3 pb-3">
        <button
          onClick={() => toggle("wellness")}
          className={`rounded-xl px-3 py-3 text-left transition-colors ${wellnessTone(p.wellnessComposite)} ${
            open === "wellness" ? "ring-2 ring-foreground/20" : ""
          }`}
        >
          <div className="text-[10px] font-bold uppercase tracking-wider opacity-70">Wellness</div>
          <div className="text-xl font-display font-bold tabular-nums">
            {p.wellnessComposite == null ? "–" : p.wellnessComposite}
            <span className="text-xs font-normal opacity-60"> / 5</span>
          </div>
          <div className="text-[10px] opacity-70 flex items-center gap-0.5">
            details <ChevronDown className={`h-3 w-3 transition-transform ${open === "wellness" ? "rotate-180" : ""}`} />
          </div>
        </button>
        <button
          onClick={() => toggle("acwr")}
          className={`rounded-xl px-3 py-3 text-left transition-colors ${acwrTone(p.acwr)} ${
            open === "acwr" ? "ring-2 ring-foreground/20" : ""
          }`}
        >
          <div className="text-[10px] font-bold uppercase tracking-wider opacity-70">Load · ACWR</div>
          <div className="text-xl font-display font-bold tabular-nums">
            {p.acwr == null ? "–" : p.acwr.toFixed(2)}
          </div>
          <div className="text-[10px] opacity-70 flex items-center gap-0.5">
            details <ChevronDown className={`h-3 w-3 transition-transform ${open === "acwr" ? "rotate-180" : ""}`} />
          </div>
        </button>
      </div>

      {open === "wellness" && (
        <div className="border-t bg-muted/20 p-3 space-y-2 animate-in fade-in slide-in-from-top-1 duration-150">
          <div className="grid grid-cols-5 gap-1.5">
            {WELLNESS_ELEMENTS.map((e) => {
              const v = p[e.key] as number | null;
              return (
                <div key={e.key} className={`rounded-lg px-1 py-1.5 text-center ${wellnessTone(v)}`}>
                  <div className="text-[10px] font-bold uppercase tracking-wide opacity-70">{e.label}</div>
                  <div className="text-base font-bold tabular-nums">{v == null ? "–" : v}</div>
                </div>
              );
            })}
          </div>
          <p className="text-base text-foreground/80 leading-relaxed">{wellnessExplanation(p)}</p>
          {p.wellnessBaseline != null && p.wellnessComposite != null && (
            <p className="text-base text-muted-foreground">
              Their usual (28-day) score is {p.wellnessBaseline} — this {windowLabel(windowDays)} window is {p.wellnessComposite}.
            </p>
          )}
        </div>
      )}

      {open === "acwr" && (
        <div className="border-t bg-muted/20 p-3 space-y-2 animate-in fade-in slide-in-from-top-1 duration-150">
          <div className="grid grid-cols-3 gap-1.5">
            <div className="rounded-lg px-1 py-1.5 text-center bg-muted/40">
              <div className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">This week</div>
              <div className="text-base font-bold tabular-nums">{p.acuteLoad}</div>
            </div>
            <div className="rounded-lg px-1 py-1.5 text-center bg-muted/40">
              <div className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">Usual week</div>
              <div className="text-base font-bold tabular-nums">
                {p.chronicWeeklyLoad == null ? "–" : Math.round(p.chronicWeeklyLoad)}
              </div>
            </div>
            <div className={`rounded-lg px-1 py-1.5 text-center ${acwrTone(p.acwr)}`}>
              <div className="text-[10px] font-bold uppercase tracking-wide opacity-70">Ratio</div>
              <div className="text-base font-bold tabular-nums">{p.acwr == null ? "–" : p.acwr.toFixed(2)}</div>
            </div>
          </div>
          <p className="text-base text-foreground/80 leading-relaxed">{acwrExplanation(p)}</p>
          {squadNote && <p className="text-base text-muted-foreground">{squadNote}</p>}
          <WeeklyHistoryBlock p={p} />
          <details className="text-base text-muted-foreground">
            <summary className="cursor-pointer select-none font-semibold">What do these load numbers mean?</summary>
            <p className="mt-1 leading-relaxed">{loadContext(p)}</p>
          </details>
          {p.windowExternalLoad ? (
            <p className="text-base text-muted-foreground">
              Includes {p.windowExternalLoad} from sessions outside the club (rep, school, other).
            </p>
          ) : null}
          {p.flags.length > 0 && (
            <ul className="space-y-0.5">
              {p.flags.map((f, i) => (
                <li key={i} className="text-base text-muted-foreground">
                  {f.severity === "alert" ? "⚠ " : "👁 "}{f.message}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

export default function TeamMonitoring() {
  const params = useParams<{ teamId: string }>();
  const teamId = Number(params.teamId);
  const [windowDays, setWindowDays] = useState(7);
  const [selected, setSelected] = useState<PlayerMonitoring | null>(null);

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

  // Most concerning first; players tied on severity stay alphabetical.
  const sortedPlayers = [...data.players].sort((a, b) => {
    const diff = severityScore(b) - severityScore(a);
    return diff !== 0 ? diff : a.person.fullName.localeCompare(b.person.fullName);
  });

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
        <p className="text-sm text-muted-foreground">
          Changing this changes the <span className="font-medium text-foreground">wellness</span> view and load totals —{" "}
          {windowDays === 1
            ? "24h shows just today's check-in, handy before training."
            : windowDays === 7
              ? "7d averages the past week — the usual view."
              : `${windowDays}d averages a longer stretch, good for spotting slow drifts.`}{" "}
          The load ratio is always last 7 days vs the 4-week average, whatever you pick.
        </p>

        {data.players.length === 0 ? (
          <EmptyState
            title="No players on this team"
            message="Add players to the roster to start monitoring."
            icon={Activity}
          />
        ) : (
          <>
          {/* Mobile: tappable score cards */}
          <div className="space-y-3 md:hidden">
            {sortedPlayers.map((p) => (
              <PlayerCard key={p.person.id} p={p} windowDays={windowDays} squadNote={squadLoadContext(p, data.players)} />
            ))}
          </div>

          {/* Desktop: at-a-glance dashboard — traffic-light tiles, click for detail */}
          <div className="hidden md:block space-y-4">
            {/* Squad summary strip */}
            <div className="grid grid-cols-4 gap-3">
              {(["red", "amber", "green", "none"] as TrafficLight[]).map((light) => {
                const count = sortedPlayers.filter((p) => overallLight(p) === light).length;
                const labels: Record<TrafficLight, string> = {
                  red: "Needs attention",
                  amber: "Keep an eye on",
                  green: "All good",
                  none: "No data",
                };
                return (
                  <div key={light} className="rounded-2xl border bg-card p-4 flex items-center gap-3">
                    <span className={`h-3.5 w-3.5 rounded-full shrink-0 ${LIGHT_DOT[light]}`} />
                    <div>
                      <div className="text-2xl font-display font-bold leading-none">{count}</div>
                      <div className="text-xs text-muted-foreground mt-1">{labels[light]}</div>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Player tiles */}
            <div className="grid grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
              {sortedPlayers.map((p) => {
                return (
                  <button
                    key={p.person.id}
                    onClick={() => setSelected(p)}
                    className="rounded-2xl border-2 border-border bg-card p-3 text-left transition-colors hover:border-foreground/30"
                  >
                    <div className="flex items-start justify-between gap-1">
                      <span className="font-semibold text-sm leading-tight truncate">{p.person.fullName}</span>
                      {p.flags.length > 0 && (
                        <span className={`text-xs font-bold shrink-0 ${p.flags.some((f) => f.severity === "alert") ? "text-red-600" : "text-amber-600"}`}>
                          {p.flags.some((f) => f.severity === "alert") ? "⚠" : "👁"} {p.flags.length}
                        </span>
                      )}
                    </div>
                    {/* Two separate lights: wellness and load each carry their own colour */}
                    <div className="mt-2 grid grid-cols-2 gap-1.5 text-xs tabular-nums">
                      <span className={`rounded-lg px-2 py-1 text-center ${wellnessTone(p.wellnessComposite)}`}>
                        <span className="opacity-70">Well </span>
                        <span className="font-bold">{p.wellnessComposite ?? "–"}</span>
                      </span>
                      <span className={`rounded-lg px-2 py-1 text-center ${acwrTone(p.acwr)}`}>
                        <span className="opacity-70">Load </span>
                        <span className="font-bold">{p.acwr == null ? "–" : p.acwr.toFixed(2)}</span>
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Player detail dialog (desktop tile click) */}
          <Dialog open={selected != null} onOpenChange={(o) => { if (!o) setSelected(null); }}>
            <DialogContent className="sm:max-w-xl">
              {selected && (
                <>
                  <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                      <span className={`h-3 w-3 rounded-full ${LIGHT_DOT[overallLight(selected)]}`} />
                      {selected.person.fullName}
                    </DialogTitle>
                  </DialogHeader>
                  <div className="space-y-4 text-sm">
                    <p className="text-xs text-muted-foreground -mt-2">
                      {selected.wellnessCount} check-in{selected.wellnessCount === 1 ? "" : "s"} in this {windowLabel(windowDays)} window
                      {selected.lastWellnessDate ? ` · last ${format(new Date(selected.lastWellnessDate + "T12:00:00"), "d MMM")}` : ""}
                      {" · "}
                      <Link href={`/people/${selected.person.id}`} className="underline hover:text-foreground">
                        view profile
                      </Link>
                    </p>

                    <div>
                      <h4 className="font-bold text-xs uppercase tracking-wider text-muted-foreground mb-1.5">
                        Wellness {selected.wellnessComposite != null ? `· ${selected.wellnessComposite}/5 (${windowLabel(windowDays)} avg)` : ""}
                        {selected.wellnessBaseline != null ? ` · usual ${selected.wellnessBaseline}` : ""}
                      </h4>
                      {selected.wellnessBaseline != null && selected.wellnessComposite != null && (
                        <p className="text-xs text-muted-foreground mb-1.5">
                          Their usual (28-day) score is {selected.wellnessBaseline} — this {windowLabel(windowDays)} window is {selected.wellnessComposite}.
                        </p>
                      )}
                      <div className="grid grid-cols-5 gap-1.5 mb-2">
                        {WELLNESS_ELEMENTS.map((e) => {
                          const v = selected[e.key] as number | null;
                          return (
                            <div key={e.key} className={`rounded-lg px-1 py-1.5 text-center ${wellnessTone(v)}`}>
                              <div className="text-[9px] font-bold uppercase tracking-wide opacity-70">{e.label}</div>
                              <div className="text-sm font-bold tabular-nums">{v == null ? "–" : v}</div>
                            </div>
                          );
                        })}
                      </div>
                      <p className="text-xs text-muted-foreground leading-relaxed">{wellnessExplanation(selected)}</p>
                    </div>

                    <div>
                      <h4 className="font-bold text-xs uppercase tracking-wider text-muted-foreground mb-1.5">
                        Workload · {selected.sessions} session{selected.sessions === 1 ? "" : "s"}
                      </h4>
                      <div className="grid grid-cols-3 gap-1.5 mb-2">
                        <div className="rounded-lg px-1 py-1.5 text-center bg-muted/40">
                          <div className="text-[9px] font-bold uppercase tracking-wide text-muted-foreground">This week</div>
                          <div className="text-sm font-bold tabular-nums">{selected.acuteLoad}</div>
                        </div>
                        <div className="rounded-lg px-1 py-1.5 text-center bg-muted/40">
                          <div className="text-[9px] font-bold uppercase tracking-wide text-muted-foreground">Usual week</div>
                          <div className="text-sm font-bold tabular-nums">
                            {selected.chronicWeeklyLoad == null ? "–" : Math.round(selected.chronicWeeklyLoad)}
                          </div>
                        </div>
                        <div className={`rounded-lg px-1 py-1.5 text-center ${acwrTone(selected.acwr)}`}>
                          <div className="text-[9px] font-bold uppercase tracking-wide opacity-70">ACWR</div>
                          <div className="text-sm font-bold tabular-nums">{selected.acwr == null ? "–" : selected.acwr.toFixed(2)}</div>
                        </div>
                      </div>
                      <p className="text-xs text-muted-foreground leading-relaxed">{acwrExplanation(selected)}</p>
                      {squadLoadContext(selected, data.players) && (
                        <p className="text-xs text-muted-foreground mt-1">{squadLoadContext(selected, data.players)}</p>
                      )}
                      {selected.windowExternalLoad ? (
                        <p className="text-[11px] text-muted-foreground mt-1">
                          Includes {selected.windowExternalLoad} from sessions outside the club (rep, school, other).
                        </p>
                      ) : null}
                      <div className="mt-3">
                        <WeeklyHistoryBlock p={selected} compact />
                      </div>
                    </div>

                    {selected.flags.length > 0 && (
                      <div>
                        <h4 className="font-bold text-xs uppercase tracking-wider text-muted-foreground mb-1.5">Flags</h4>
                        <ul className="space-y-0.5">
                          {selected.flags.map((f, i) => (
                            <li key={i} className="text-xs text-muted-foreground">
                              {f.severity === "alert" ? "⚠ " : "👁 "}{f.message}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}

                    <div className="rounded-xl bg-muted/40 border p-3">
                      <h4 className="font-bold text-xs uppercase tracking-wider text-muted-foreground mb-1">
                        Talking to them
                      </h4>
                      <p className="text-xs leading-relaxed">{conversationGuide(selected)}</p>
                    </div>
                  </div>
                </>
              )}
            </DialogContent>
          </Dialog>
          </>
        )}

        <p className="text-xs text-muted-foreground">
          Players are sorted most-concerning first. Wellness cells show the{" "}
          {windowDays === 1 ? "24-hour" : `${windowDays}-day`} average on a 1–5 scale (higher is better).
          Load = how hard it felt (1–10) × minutes, so a tough 90-minute session ≈ 600–700 and a light one
          ≈ 200–300 — a 2,000 week is roughly three or four solid sessions. Flags compare each player against
          their own 28-day baseline — thresholds are a draft pending physio review.
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
                <li>
                  <span className="text-foreground">Sustained high load</span> — ACWR only measures{" "}
                  <em>change</em>, so a player grinding heavy weeks for a month drifts back to green. This
                  flag catches that: it fires when their 4-week weekly average sits well above the squad's
                  norm. Check in more often, or have them skip a session to bring it down — hover their
                  Load number to see what one skipped session is worth (≈ their average per session).
                </li>
                <li>
                  <span className="text-foreground">
                    A <span className="text-sky-600 font-bold">*</span> on Load
                  </span>{" "}
                  — part of that workload came from outside the club (rep squad, school sport). Hover to see
                  how much. Rep players carry hidden load — that's exactly who this board is for.
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
