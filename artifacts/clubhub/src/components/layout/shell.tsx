import { Link, useLocation } from "wouter";
import { useClerk, useUser } from "@clerk/react";
import { 
  Home, Users, CalendarDays, MessageSquare, Settings, 
  LogOut, ChevronDown, UserSquare2, ClipboardCheck, Activity, Bell
} from "lucide-react";
import {
  useGetMe, useGetClub, useListNotifications,
  getGetMeQueryKey, getGetClubQueryKey, getListNotificationsQueryKey
} from "@workspace/api-client-react";

import { Button } from "@/components/ui/button";
import { PostComposer } from "@/components/feed/post-composer";
import { TeamSwitcher, useTeamUnreads } from "@/components/layout/team-switcher";
import { useActiveTeam } from "@/lib/active-team";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { 
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, 
  DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger 
} from "@/components/ui/dropdown-menu";

export default function Shell({ children }: { children: React.ReactNode }) {
  const [location] = useLocation();
  const { signOut } = useClerk();
  const { user: clerkUser } = useUser();

  // We use the same query keys that the generated hook uses internally 
  const { data: me, isLoading: isLoadingMe } = useGetMe({ 
    query: { queryKey: getGetMeQueryKey() } 
  });
  
  const { data: club } = useGetClub({
    query: { queryKey: getGetClubQueryKey() }
  });

  // Unread badge on the Home tab: unread in the ACTIVE team (or any team
  // when viewing "All teams").
  const { activeTeamId } = useActiveTeam();
  const { data: unreads } = useTeamUnreads();
  const homeUnread = (unreads ?? [])
    .filter((t) => (activeTeamId == null ? true : t.teamId === activeTeamId))
    .some((t) => t.unreadPosts + t.unreadMessages > 0);

  const { data: notificationsData } = useListNotifications(
    undefined,
    {
      query: {
        queryKey: getListNotificationsQueryKey(),
        refetchInterval: 20000,
        refetchOnWindowFocus: true,
      },
    },
  );
  const notificationsUnread = notificationsData?.unreadCount ?? 0;

  // Staff (club admins, coaches, managers) see the full menu; players get a
  // simpler app: Home, Schedule, Check-in and Messages.
  const isStaff =
    !!me?.isClubAdmin ||
    !!me?.memberships?.some((m: any) => m.role === "coach" || m.role === "manager");
  // Check-in is a player thing — parents (guardians) and staff don't need it.
  const isPlayer = !!me?.memberships?.some((m: any) => m.role === "player");

  // Monitoring tab (staff): the active team if they actually staff it,
  // otherwise the first team they coach/manage. Club admins can open any team.
  const staffedTeamIds = new Set(
    (me?.memberships ?? [])
      .filter((m: any) => m.role === "coach" || m.role === "manager")
      .map((m: any) => m.teamId),
  );
  const staffTeamId = me?.isClubAdmin
    ? (activeTeamId ?? me?.memberships?.[0]?.teamId ?? null)
    : activeTeamId != null && staffedTeamIds.has(activeTeamId)
      ? activeTeamId
      : (staffedTeamIds.values().next().value as number | undefined) ?? null;

  const navItems = [
    { label: "Home", href: "/home", icon: Home },
    { label: "Schedule", href: "/schedule", icon: CalendarDays },
    ...(isPlayer ? [{ label: "Check-in", href: "/checkin", icon: ClipboardCheck }] : []),
    { label: "Messages", href: "/messages", icon: MessageSquare },
    ...(isStaff ? [{ label: "Directory", href: "/people", icon: UserSquare2 }] : []),
    ...(isStaff && staffTeamId != null
      ? [{ label: "Monitoring", href: `/teams/${staffTeamId}/monitoring`, icon: Activity }]
      : []),
  ];

  // Bottom tab bar (mobile): max 4 tabs + everything else lives in the
  // avatar menu. Players: Home/Schedule/Check-in/Messages.
  // Parents: Home/Schedule/Messages. Staff: Home/Schedule/Messages/Monitoring.
  const tabItems = navItems.filter((i) =>
    isStaff
      ? i.label !== "Check-in" && i.label !== "Directory"
      : i.label !== "Monitoring" && i.label !== "Directory",
  );

  return (
    <div className="min-h-screen bg-muted/20 flex flex-col md:flex-row overflow-x-clip">
      {/* Sidebar for Desktop */}
      <aside className="hidden md:flex flex-col w-72 bg-background border-r shrink-0 sticky top-0 h-screen">
        <div className="h-16 flex items-center px-6 border-b shrink-0">
          <Link href="/home" className="flex items-center gap-3 w-full">
            {club?.logoUrl ? (
              <img src={club.logoUrl} alt={club.name} className="h-8 w-8 object-contain" />
            ) : (
              <div className="h-8 w-8 bg-primary rounded-lg flex items-center justify-center shrink-0">
                <span className="text-primary-foreground font-display font-black text-lg leading-none">CH</span>
              </div>
            )}
            <span className="font-display font-bold text-lg truncate">
              {club?.name || "ClubHub"}
            </span>
          </Link>
        </div>

        <div className="flex-1 overflow-y-auto py-6 px-4 flex flex-col gap-1">
          <div className="mb-4">
            <TeamSwitcher />
          </div>
          <div className="px-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
            Menu
          </div>
          {navItems.map((item) => {
            const isActive = location.startsWith(item.href);
            return (
              <Link 
                key={item.href} 
                href={item.href}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-colors ${
                  isActive 
                    ? "bg-primary text-primary-foreground shadow-sm shadow-primary/20" 
                    : "text-foreground hover:bg-muted"
                }`}
              >
                <item.icon className="h-5 w-5" />
                {item.label}
              </Link>
            );
          })}
        </div>

        <div className="p-4 border-t shrink-0 flex flex-col gap-2">
          <Link href="/notifications" className={`flex items-center justify-between px-3 py-2 rounded-xl text-sm font-medium transition-colors ${
            location.startsWith("/notifications")
              ? "bg-primary text-primary-foreground shadow-sm shadow-primary/20"
              : "text-foreground hover:bg-muted"
          }`}>
            <div className="flex items-center gap-3">
              <Bell className="h-5 w-5" />
              Notifications
            </div>
            {notificationsUnread > 0 && (
              <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                location.startsWith("/notifications")
                  ? "bg-primary-foreground text-primary"
                  : "bg-primary text-primary-foreground"
              }`}>
                {notificationsUnread}
              </span>
            )}
          </Link>
          <UserMenu me={me} clerkUser={clerkUser} onSignOut={() => signOut({ redirectUrl: "/" })} isStaff={isStaff} notificationsUnread={notificationsUnread} />
        </div>
      </aside>

      {/* Mobile Header — only on Home; other pages have their own compact headers */}
      {location === "/home" && (
      <header className="md:hidden h-16 bg-background border-b flex items-center justify-between px-4 sticky top-0 z-40 gap-2">
        <div className="flex items-center gap-1 min-w-0">
          <Link href="/home" className="flex items-center shrink-0">
            <div className="h-8 w-8 bg-primary rounded flex items-center justify-center">
              <span className="text-primary-foreground font-display font-black text-sm leading-none">CH</span>
            </div>
          </Link>
          <TeamSwitcher compact />
        </div>
        
        <div className="flex items-center gap-1 shrink-0">
          <Link href="/notifications" className="relative p-2 text-muted-foreground hover:text-foreground hover:bg-muted rounded-full transition-colors">
            <Bell className="h-6 w-6" />
            {notificationsUnread > 0 && (
              <span className="absolute top-1.5 right-1.5 h-2.5 w-2.5 rounded-full bg-destructive ring-2 ring-background" />
            )}
          </Link>
          <UserMenu
            me={me}
            clerkUser={clerkUser}
            onSignOut={() => signOut({ redirectUrl: "/" })}
            avatarOnly
            isStaff={isStaff}
            notificationsUnread={notificationsUnread}
          />
        </div>
      </header>
      )}

      {/* Main Content Area */}
      <main className="flex-1 flex flex-col w-full max-w-full overflow-hidden pb-[calc(4rem+env(safe-area-inset-bottom))] md:pb-0">
        {children}
      </main>

      {/* Mobile: floating new-post button, pinned above the tab bar.
          Hidden inside a chat, where it would cover the message composer. */}
      {/* New-post button: staff only (server rejects non-staff posts anyway),
          and only on the Home feed. */}
      {isStaff && location === "/home" && <PostComposer variant="fab" />}

      {/* Mobile Bottom Tab Bar (Heja-style) */}
      <nav className="md:hidden fixed bottom-0 inset-x-0 z-40 bg-background border-t flex items-stretch pb-[env(safe-area-inset-bottom)]">
        {tabItems.map((item) => {
          const isActive = location.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex-1 flex flex-col items-center justify-center gap-0.5 py-2 min-h-14 ${
                isActive ? "text-primary" : "text-muted-foreground"
              }`}
            >
              <span className="relative">
                <item.icon className={`h-6 w-6 ${isActive ? "" : "opacity-80"}`} strokeWidth={isActive ? 2.4 : 2} />
                {item.label === "Home" && homeUnread && (
                  <span className="absolute -top-0.5 -right-1 h-2.5 w-2.5 rounded-full bg-destructive ring-2 ring-background" />
                )}
              </span>
              <span className={`text-[11px] leading-none ${isActive ? "font-bold" : "font-medium"}`}>
                {item.label}
              </span>
            </Link>
          );
        })}
      </nav>
    </div>
  );
}

/** Managers and coaches share the same permissions; managers show as "Team Admin". */
function roleLabel(me: any) {
  if (me?.isClubAdmin) return "Club Admin";
  if (me?.memberships?.some((m: any) => m.role === "manager")) return "Team Admin";
  if (me?.memberships?.some((m: any) => m.role === "coach")) return "Coach";
  return "Member";
}

function UserMenu({ me, clerkUser, onSignOut, avatarOnly = false, isStaff = false, notificationsUnread = 0 }: { me: any, clerkUser: any, onSignOut: () => void, avatarOnly?: boolean, isStaff?: boolean, notificationsUnread?: number }) {
  const avatarUrl = me?.person?.avatarUrl || clerkUser?.imageUrl;
  const name = me?.person?.fullName || clerkUser?.fullName || "Loading...";

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        {avatarOnly ? (
          <Button variant="ghost" size="icon" className="rounded-full" aria-label="Account menu">
            <Avatar className="h-9 w-9 border border-border/50">
              <AvatarImage src={avatarUrl} />
              <AvatarFallback className="bg-primary/10 text-primary font-semibold text-sm">
                {name.charAt(0)}
              </AvatarFallback>
            </Avatar>
          </Button>
        ) : (
        <Button variant="ghost" className="w-full justify-start p-2 h-auto rounded-xl hover:bg-muted">
          <div className="flex items-center gap-3 w-full">
            <Avatar className="h-9 w-9 shrink-0 border border-border/50">
              <AvatarImage src={avatarUrl} />
              <AvatarFallback className="bg-primary/10 text-primary font-semibold text-sm">
                {name.charAt(0)}
              </AvatarFallback>
            </Avatar>
            <div className="flex flex-col items-start flex-1 min-w-0">
              <span className="font-semibold text-sm truncate w-full text-left">{name}</span>
              <span className="text-xs text-muted-foreground truncate w-full text-left">
                {roleLabel(me)}
              </span>
            </div>
            <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" />
          </div>
        </Button>
        )}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64 rounded-2xl p-2 shadow-xl border-border/50">
        <DropdownMenuLabel className="font-normal p-2">
          <div className="flex flex-col space-y-1">
            <p className="text-sm font-medium leading-none">{name}</p>
            <p className="text-xs leading-none text-muted-foreground">
              {clerkUser?.primaryEmailAddress?.emailAddress}
            </p>
          </div>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        
        {me?.guardianOf?.length > 0 && (
          <>
            <div className="px-2 py-1.5 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              Family Accounts
            </div>
            {me.guardianOf.map((ward: any) => (
              <DropdownMenuItem key={ward.id} className="rounded-xl py-2 cursor-pointer">
                <Avatar className="h-6 w-6 mr-2 shrink-0">
                  <AvatarImage src={ward.avatarUrl} />
                  <AvatarFallback className="text-[10px]">{ward.firstName?.charAt(0)}</AvatarFallback>
                </Avatar>
                <div className="flex flex-col flex-1">
                  <span className="text-sm">{ward.fullName}</span>
                </div>
              </DropdownMenuItem>
            ))}
            <DropdownMenuSeparator />
          </>
        )}
        
        <DropdownMenuItem asChild className="rounded-xl py-2 cursor-pointer md:hidden">
          <Link href="/notifications" className="flex items-center w-full justify-between">
            <div className="flex items-center">
              <Bell className="mr-2 h-4 w-4 text-muted-foreground" />
              <span>Notifications</span>
            </div>
            {notificationsUnread > 0 && (
              <span className="bg-destructive text-white text-[10px] font-bold px-2 py-0.5 rounded-full">
                {notificationsUnread}
              </span>
            )}
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild className="rounded-xl py-2 cursor-pointer">
          <Link href="/settings" className="flex items-center w-full">
            <Settings className="mr-2 h-4 w-4 text-muted-foreground" />
            <span>Profile & Settings</span>
          </Link>
        </DropdownMenuItem>
        {isStaff && (
          <>
            <DropdownMenuItem asChild className="rounded-xl py-2 cursor-pointer">
              <Link href="/people" className="flex items-center w-full">
                <UserSquare2 className="mr-2 h-4 w-4 text-muted-foreground" />
                <span>Directory</span>
              </Link>
            </DropdownMenuItem>
          </>
        )}
        <DropdownMenuItem onClick={onSignOut} className="rounded-xl py-2 cursor-pointer text-destructive focus:text-destructive focus:bg-destructive/10">
          <LogOut className="mr-2 h-4 w-4" />
          <span>Log out</span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
