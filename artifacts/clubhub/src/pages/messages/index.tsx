import { Link } from "wouter";
import { format } from "date-fns";
import { MessageSquare, Users, Hash, Plus, MessageCircle } from "lucide-react";
import { useListChats, getListChatsQueryKey, useGetMe, getGetMeQueryKey } from "@workspace/api-client-react";

import { LoadingScreen, ErrorState, EmptyState } from "@/components/ui/states";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";

export default function Messages() {
  const { data: chats, isLoading, error, refetch } = useListChats({ 
    query: { queryKey: getListChatsQueryKey() } 
  });
  const { data: me } = useGetMe({ query: { queryKey: getGetMeQueryKey() } });
  const myId = me?.person?.id;

  if (isLoading) return <LoadingScreen message="Loading messages..." />;
  if (error || !chats) return <ErrorState onRetry={() => refetch()} />;

  const teamChats = chats.filter(c => c.type === 'team');
  const otherChats = chats.filter(c => c.type !== 'team');

  return (
    <div className="flex-1 overflow-y-auto bg-muted/10">
      <div className="container mx-auto p-4 md:p-8 lg:max-w-4xl space-y-8">
        <header className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-display font-bold tracking-tight">Messages</h1>
            <p className="text-muted-foreground mt-1">Communicate with your teams and groups.</p>
          </div>
          <Button className="rounded-full shadow-sm px-6 font-bold">
            <Plus className="h-4 w-4 mr-2" /> New Message
          </Button>
        </header>

        {chats.length === 0 ? (
          <EmptyState 
            title="No messages yet" 
            message="When you are assigned to a team, its chat will appear here."
            icon={MessageSquare}
          />
        ) : (
          <div className="space-y-8">
            {teamChats.length > 0 && (
              <div className="space-y-4">
                <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider pl-1">Team Chats</h2>
                <div className="bg-card border rounded-3xl overflow-hidden shadow-sm flex flex-col divide-y">
                  {teamChats.map(chat => (
                    <ChatRow key={chat.id} chat={chat} myId={myId} />
                  ))}
                </div>
              </div>
            )}
            
            {otherChats.length > 0 && (
              <div className="space-y-4">
                <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider pl-1">Direct & Groups</h2>
                <div className="bg-card border rounded-3xl overflow-hidden shadow-sm flex flex-col divide-y">
                  {otherChats.map(chat => (
                    <ChatRow key={chat.id} chat={chat} myId={myId} />
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function ChatRow({ chat, myId }: { chat: any; myId?: number }) {
  const isTeam = chat.type === 'team';
  // Unread: last message is from someone else and newer than my last read.
  const unread =
    !!chat.lastMessage &&
    chat.lastMessage.author.id !== myId &&
    (!chat.myLastReadAt ||
      new Date(chat.lastMessage.createdAt) > new Date(chat.myLastReadAt));

  return (
    <Link href={`/messages/${chat.id}`} className="block p-4 hover:bg-muted/30 transition-colors cursor-pointer group">
      <div className="flex items-center gap-4">
        {isTeam ? (
          <div className="h-14 w-14 rounded-2xl bg-primary/10 flex items-center justify-center shrink-0 border border-primary/20 group-hover:bg-primary group-hover:text-primary-foreground transition-colors">
            <Hash className="h-6 w-6 text-primary group-hover:text-primary-foreground transition-colors" />
          </div>
        ) : (
          <Avatar className="h-14 w-14 border shadow-sm shrink-0">
            <AvatarFallback className="bg-muted text-muted-foreground font-bold">
              {chat.name.substring(0, 2).toUpperCase()}
            </AvatarFallback>
          </Avatar>
        )}
        
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between mb-1">
            <h3 className="font-bold text-lg truncate pr-4 group-hover:text-primary transition-colors">{chat.name}</h3>
            {chat.lastMessage && (
              <span className="text-xs text-muted-foreground shrink-0 font-medium">
                {format(new Date(chat.lastMessage.createdAt), "MMM d")}
              </span>
            )}
          </div>
          
          <div className="flex items-center gap-2">
            {chat.lastMessage ? (
              <p className={`text-sm truncate flex-1 ${unread ? "text-foreground font-semibold" : "text-muted-foreground font-medium"}`}>
                <span className="text-foreground">{chat.lastMessage.author.firstName}: </span>
                {chat.lastMessage.body}
              </p>
            ) : (
              <p className="text-sm text-muted-foreground/60 italic flex-1">No messages yet</p>
            )}

            {unread && (
              <span className="h-2.5 w-2.5 rounded-full bg-destructive shrink-0" />
            )}
            {isTeam && (
              <span className="flex items-center text-xs font-semibold text-muted-foreground bg-muted px-2 py-0.5 rounded-full">
                <Users className="h-3 w-3 mr-1" /> {chat.memberCount}
              </span>
            )}
          </div>
        </div>
      </div>
    </Link>
  );
}
