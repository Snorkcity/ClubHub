import { useEffect } from "react";
import { Check, ChevronDown, Users, Building2 } from "lucide-react";
import { useLocation } from "wouter";
import {
  useListTeamUnreads,
  getListTeamUnreadsQueryKey,
  useGetPlatformAccess,
  getGetPlatformAccessQueryKey,
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
import { switchClub } from "@/lib/active-club";
import { ClubMark } from "@/components/brand/club-mark";

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
 * The club logo opens the current club's teams and the account's other clubs.
 * Club switches use the existing full reload to discard all old club state.
 */
export function TeamSwitcher({
  collapsed = false,
  club,
}: {
  collapsed?: boolean;
  club?: { id: number; name: string; logoUrl?: string | null };
}) {
  const { activeTeamId, setActiveTeamId } = useActiveTeam();
  const [, navigate] = useLocation();
  const teamsQuery = useTeamUnreads();
  const { data: unreads } = teamsQuery;
  const accessQuery = useGetPlatformAccess({
    query: {
      queryKey: getGetPlatformAccessQueryKey(),
      staleTime: 30_000,
      refetchOnWindowFocus: true,
    },
  });

  const teams = unreads ?? [];

  // If the stored active team is no longer visible (left the team), reset.
  useEffect(() => {
    if (
      activeTeamId != null &&
      teamsQuery.isSuccess &&
      !teams.some((t) => t.teamId === activeTeamId)
    ) {
      setActiveTeamId(null);
    }
  }, [activeTeamId, teams, teamsQuery.isSuccess, setActiveTeamId]);

  const active = teams.find((t) => t.teamId === activeTeamId) ?? null;
  const label = active?.teamName ?? (teams.length === 1 ? teams[0].teamName : teams.length > 1 ? "All teams" : club?.name ?? "Nahreo");

  // Note: switching does NOT mark the team seen — that happens after the
  // user has actually been viewing its content for a moment (home/team page).
  const select = (teamId: number | null) => {
    setActiveTeamId(teamId);
    navigate("/home");
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          aria-label={`Switch club or team, ${club?.name ?? "Nahreo"}, currently showing ${label}`}
          title={`Switch club or team: ${label}`}
          data-testid="button-switch-club-team"
          className={collapsed
            ? "h-11 w-11 justify-center rounded-xl p-0"
            : "h-12 min-w-0 w-full justify-start gap-2 rounded-xl px-1 font-semibold"}
        >
          <span className="shrink-0">
            <ClubMark logoUrl={club?.logoUrl} name={club?.name} />
          </span>
          {!collapsed && (
            <span className="flex min-w-0 flex-col items-start leading-tight">
              <span className="w-full truncate text-xs text-muted-foreground">
                {club?.name ?? "Nahreo"}
              </span>
              <span className="w-full truncate font-display text-sm font-bold">
                {label}
              </span>
            </span>
          )}
          {!collapsed && <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-72 max-w-[calc(100vw-1rem)] max-h-[min(70dvh,var(--radix-dropdown-menu-content-available-height))] overflow-y-auto rounded-2xl p-2 shadow-xl">
        <DropdownMenuLabel className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
          Teams in {club?.name ?? "this club"}
        </DropdownMenuLabel>
        {teamsQuery.isPending && <div className="px-2 py-3 text-sm text-muted-foreground">Loading teams…</div>}
        {teamsQuery.isError && (
          <DropdownMenuItem onSelect={(event) => { event.preventDefault(); void teamsQuery.refetch(); }}>
            Unable to load teams. Try again
          </DropdownMenuItem>
        )}
        {teamsQuery.isSuccess && teams.length === 0 && <div className="px-2 py-3 text-sm text-muted-foreground">No teams available in this club.</div>}
        {teams.length > 1 && (
        <>
        <DropdownMenuItem
          className="rounded-xl py-2.5 cursor-pointer"
          onClick={() => select(null)}
        >
          <Users className="h-4 w-4 mr-2 text-muted-foreground" />
          <span className="flex-1">All teams</span>
          {activeTeamId == null && <Check className="h-4 w-4 text-primary" />}
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        </>
        )}
        {teams.map((t) => {
          const unread = t.unreadPosts + t.unreadMessages;
          const isActive = t.teamId === activeTeamId;
          return (
            <DropdownMenuItem
              key={t.teamId}
              className="min-h-11 rounded-xl py-2.5 cursor-pointer"
              onClick={() => select(t.teamId)}
            >
              <span className="min-w-0 flex-1 truncate">{t.teamName}</span>
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
        <DropdownMenuSeparator />
        <DropdownMenuLabel className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
          My clubs
        </DropdownMenuLabel>
        {accessQuery.isPending && <div className="px-2 py-3 text-sm text-muted-foreground">Loading clubs…</div>}
        {accessQuery.isError && (
          <DropdownMenuItem onSelect={(event) => { event.preventDefault(); void accessQuery.refetch(); }}>
            Unable to load clubs. Try again
          </DropdownMenuItem>
        )}
        {(accessQuery.data?.clubs ?? []).map((option) => (
          <DropdownMenuItem
            key={option.id}
            className="min-h-11 cursor-pointer gap-2 rounded-xl py-2.5"
            onSelect={() => { if (option.id !== club?.id) switchClub(option.id); }}
          >
            <Building2 className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
            <span className="min-w-0 flex-1 truncate">{option.name}</span>
            {option.id === club?.id && <Check className="h-4 w-4 shrink-0 text-primary" aria-label="Current club" />}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
