import { useEffect } from "react";
import { Check, ChevronDown, Users } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useListTeamUnreads,
  useMarkTeamSeen,
  getListTeamUnreadsQueryKey,
} from "@workspace/api-client-react";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useActiveTeam } from "@/lib/active-team";

/** Poll unread counts every 60s so badges stay fresh without a refresh. */
export function useTeamUnreads() {
  return useListTeamUnreads({
    query: {
      queryKey: getListTeamUnreadsQueryKey(),
      refetchInterval: 60_000,
      refetchOnWindowFocus: true,
    },
  });
}

/**
 * Heja-style team switcher. Shows the active team (or "All teams") with a
 * chevron; the dropdown lists every team you belong to, with unread badges
 * for the teams you're NOT currently looking at.
 */
export function TeamSwitcher({ compact = false }: { compact?: boolean }) {
  const { activeTeamId, setActiveTeamId } = useActiveTeam();
  const { data: unreads } = useTeamUnreads();

  const teams = unreads ?? [];

  // If the stored active team is no longer visible (left the team), reset.
  useEffect(() => {
    if (
      activeTeamId != null &&
      teams.length > 0 &&
      !teams.some((t) => t.teamId === activeTeamId)
    ) {
      setActiveTeamId(null);
    }
  }, [activeTeamId, teams, setActiveTeamId]);

  // Only one team: nothing to switch, no dropdown needed.
  if (teams.length <= 1) return null;

  const active = teams.find((t) => t.teamId === activeTeamId) ?? null;
  const label = active ? active.teamName : "All teams";

  // Note: switching does NOT mark the team seen — that happens after the
  // user has actually been viewing its content for a moment (home/team page).
  const select = (teamId: number | null) => setActiveTeamId(teamId);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          aria-label={`My teams, currently showing ${label}`}
          className={
            compact
              ? "h-11 max-w-[45vw] gap-1.5 px-2"
              : "w-full justify-between rounded-xl h-10 px-3 font-semibold"
          }
        >
          {compact ? (
            <span className="flex min-w-0 flex-col items-start leading-tight">
              <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                My teams
              </span>
              <span className="w-full truncate font-display text-sm font-bold">
                {label}
              </span>
            </span>
          ) : (
            <span className="truncate">{label}</span>
          )}
          <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-64 rounded-2xl p-2 shadow-xl">
        <DropdownMenuLabel className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
          My teams
        </DropdownMenuLabel>
        <DropdownMenuItem
          className="rounded-xl py-2.5 cursor-pointer"
          onClick={() => select(null)}
        >
          <Users className="h-4 w-4 mr-2 text-muted-foreground" />
          <span className="flex-1">All teams</span>
          {activeTeamId == null && <Check className="h-4 w-4 text-primary" />}
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        {teams.map((t) => {
          const unread = t.unreadPosts + t.unreadMessages;
          const isActive = t.teamId === activeTeamId;
          return (
            <DropdownMenuItem
              key={t.teamId}
              className="rounded-xl py-2.5 cursor-pointer"
              onClick={() => select(t.teamId)}
            >
              <span className="flex-1 truncate">{t.teamName}</span>
              {isActive ? (
                <Check className="h-4 w-4 text-primary" />
              ) : unread > 0 ? (
                <span className="ml-2 min-w-5 h-5 shrink-0 whitespace-nowrap px-1.5 rounded-full bg-destructive text-destructive-foreground text-[11px] font-bold flex items-center justify-center">
                  {unread > 99 ? "99+" : unread}
                </span>
              ) : null}
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
