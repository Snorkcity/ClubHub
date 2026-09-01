import { formatDistanceToNow } from "date-fns";
import { useInfiniteQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { Bell, CalendarDays, MessageSquare, CheckCircle2 } from "lucide-react";
import {
  listNotifications,
  getListNotificationsQueryKey,
  useReadAllNotifications,
  useReadNotification,
} from "@workspace/api-client-react";
import { queryClient } from "@/lib/queryClient";

import { LoadingScreen, ErrorState, EmptyState } from "@/components/ui/states";
import { Button } from "@/components/ui/button";

const notificationsInfiniteQueryKey = [
  ...getListNotificationsQueryKey(),
  "infinite",
] as const;

export default function Notifications() {
  const [, setLocation] = useLocation();
  const {
    data,
    isLoading,
    error,
    refetch,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useInfiniteQuery({
    queryKey: notificationsInfiniteQueryKey,
    queryFn: ({ pageParam }) =>
      listNotifications({
        limit: 50,
        cursor: typeof pageParam === "number" ? pageParam : undefined,
      }),
    initialPageParam: null as number | null,
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
    refetchInterval: 20000,
    refetchOnWindowFocus: true,
  });

  const readAll = useReadAllNotifications();
  const readOne = useReadNotification();

  const handleMarkAllRead = () => {
    readAll.mutate(undefined, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListNotificationsQueryKey() });
      }
    });
  };

  const handleNotificationClick = (id: number, href: string, isUnread: boolean) => {
    if (isUnread) {
      readOne.mutate({ notificationId: id }, {
        onSuccess: () => {
          queryClient.setQueryData(notificationsInfiniteQueryKey, (oldData: any) => {
            if (!oldData) return oldData;
            return {
              ...oldData,
              pages: oldData.pages.map((page: any, index: number) => ({
                ...page,
                unreadCount:
                  index === 0 ? Math.max(0, page.unreadCount - 1) : page.unreadCount,
                notifications: page.notifications.map((n: any) =>
                  n.id === id
                    ? { ...n, unread: false, readAt: new Date().toISOString() }
                    : n,
                ),
              })),
            };
          });
          queryClient.invalidateQueries({ queryKey: getListNotificationsQueryKey() });
        }
      });
    }
    setLocation(href);
  };

  if (isLoading) return <LoadingScreen message="Loading notifications..." />;
  if (error || !data) return <ErrorState onRetry={() => refetch()} />;

  const unreadCount = data.pages[0]?.unreadCount ?? 0;
  const notifications = Array.from(
    new Map(
      data.pages
        .flatMap((page) => page.notifications)
        .map((notification) => [notification.id, notification]),
    ).values(),
  );

  return (
    <div className="flex-1 overflow-y-auto overflow-x-hidden bg-muted/10 pb-[env(safe-area-inset-bottom)]">
      <header className="sticky top-0 z-20 bg-background/95 backdrop-blur border-b">
        <div className="container mx-auto px-4 md:px-8 lg:max-w-3xl h-14 flex items-center justify-between">
          <h1 className="text-xl font-display font-bold tracking-tight">Notifications</h1>
          {unreadCount > 0 && (
            <Button
              variant="ghost"
              size="sm"
              onClick={handleMarkAllRead}
              disabled={readAll.isPending}
              className="text-primary font-semibold hover:bg-primary/10 rounded-full h-8"
            >
              <CheckCircle2 className="h-4 w-4 mr-2" />
              Mark all read
            </Button>
          )}
        </div>
      </header>

      <div className="container mx-auto p-4 md:p-8 lg:max-w-3xl">
        {notifications.length === 0 ? (
          <EmptyState
            title="You're all caught up"
            message="No new notifications right now."
            icon={Bell}
          />
        ) : (
          <div className="space-y-2">
            {notifications.map((notif) => {
              const Icon = notif.kind === "event" ? CalendarDays : MessageSquare;
              const iconColor = notif.kind === "event" ? "text-emerald-600 dark:text-emerald-400" : "text-blue-600 dark:text-blue-400";
              const bgColor = notif.kind === "event" ? "bg-emerald-100 dark:bg-emerald-900/30" : "bg-blue-100 dark:bg-blue-900/30";

              return (
                <button
                  key={notif.id}
                  onClick={() => handleNotificationClick(notif.id, notif.deepLink, notif.unread)}
                  className={`w-full text-left flex items-start gap-4 p-4 rounded-2xl transition-all border ${
                    notif.unread
                      ? "bg-card border-primary/20 shadow-sm"
                      : "bg-transparent border-transparent hover:bg-muted/50"
                  }`}
                >
                  <div className={`h-10 w-10 shrink-0 rounded-full flex items-center justify-center ${bgColor}`}>
                    <Icon className={`h-5 w-5 ${iconColor}`} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex justify-between items-baseline gap-2 mb-0.5">
                      <span className={`text-sm truncate ${notif.unread ? "font-bold text-foreground" : "font-semibold text-muted-foreground"}`}>
                        {notif.title}
                      </span>
                      <span className="text-[11px] whitespace-nowrap text-muted-foreground shrink-0 font-medium">
                        {formatDistanceToNow(new Date(notif.createdAt), { addSuffix: true })}
                      </span>
                    </div>
                    <p className={`text-sm line-clamp-2 ${notif.unread ? "text-foreground font-medium" : "text-muted-foreground"}`}>
                      {notif.body}
                    </p>
                  </div>
                  {notif.unread && (
                    <div className="shrink-0 self-center w-2 h-2 rounded-full bg-primary" />
                  )}
                </button>
              );
            })}
            {hasNextPage && (
              <Button
                type="button"
                variant="outline"
                onClick={() => fetchNextPage()}
                disabled={isFetchingNextPage}
                className="mt-4 w-full rounded-xl"
              >
                {isFetchingNextPage ? "Loading older notifications…" : "Load older notifications"}
              </Button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
