import { useMemo, useState } from "react";
import { Link, useLocation } from "wouter";
import { format } from "date-fns";
import { MessageSquare, Users, Hash, Plus, MessageCircle, Search, Check } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useListChats, getListChatsQueryKey, useGetMe, getGetMeQueryKey,
  useListPeople, getListPeopleQueryKey, useCreateChat,
} from "@workspace/api-client-react";

import { LoadingScreen, ErrorState, EmptyState } from "@/components/ui/states";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";

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
      {/* Sticky header with divider — stays put while chats scroll. */}
      <header className="sticky top-0 z-20 bg-background/95 backdrop-blur border-b">
        <div className="container mx-auto px-4 md:px-6 lg:max-w-4xl h-12 flex items-center justify-between">
          <h1 className="text-xl font-display font-bold tracking-tight">Chats</h1>
          <NewChatDialog myId={myId} />
        </div>
      </header>
      <div className="container mx-auto p-4 md:p-6 lg:max-w-4xl space-y-6">
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

/** "New +" button — pick people from the club directory and start a chat. */
function NewChatDialog({ myId }: { myId?: number }) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Record<number, { id: number; name: string }>>({});
  const [, navigate] = useLocation();
  const queryClient = useQueryClient();

  const { data: people, isLoading } = useListPeople(undefined, {
    query: { queryKey: getListPeopleQueryKey(), enabled: open },
  });

  const createChat = useCreateChat({
    mutation: {
      onSuccess: (chat) => {
        queryClient.invalidateQueries({ queryKey: getListChatsQueryKey() });
        setOpen(false);
        setSelected({});
        setSearch("");
        navigate(`/messages/${chat.id}`);
      },
    },
  });

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (people ?? [])
      .filter((p) => p.id !== myId)
      .filter((p) => !q || p.fullName.toLowerCase().includes(q));
  }, [people, search, myId]);

  const picked = Object.values(selected);

  function toggle(p: { id: number; fullName: string }) {
    setSelected((prev) => {
      const next = { ...prev };
      if (next[p.id]) delete next[p.id];
      else next[p.id] = { id: p.id, name: p.fullName };
      return next;
    });
  }

  function start() {
    if (picked.length === 0 || createChat.isPending) return;
    const name =
      picked.length === 1
        ? picked[0].name
        : picked.map((p) => p.name.split(" ")[0]).join(", ");
    createChat.mutate({
      data: {
        name,
        type: picked.length === 1 ? "direct" : "group",
        memberIds: picked.map((p) => p.id),
      },
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" className="rounded-full font-bold px-4">
          New <Plus className="h-4 w-4 ml-1" />
        </Button>
      </DialogTrigger>
      {/* Anchored near the top on phones so the on-screen keyboard doesn't
          cover the search field; centered on larger screens. */}
      <DialogContent className="max-w-md rounded-2xl p-0 gap-0 overflow-hidden top-6 translate-y-0 sm:top-[50%] sm:translate-y-[-50%] max-h-[calc(100dvh-3rem)] flex flex-col">
        <DialogHeader className="p-4 pb-3 border-b">
          <DialogTitle className="font-display">New chat</DialogTitle>
          <div className="relative mt-2">
            <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search people..."
              className="pl-9 rounded-xl"
            />
          </div>
        </DialogHeader>

        <div className="max-h-72 overflow-y-auto divide-y flex-1 min-h-0">
          {isLoading && <p className="p-4 text-sm text-muted-foreground">Loading people...</p>}
          {!isLoading && filtered.length === 0 && (
            <p className="p-4 text-sm text-muted-foreground">No one found.</p>
          )}
          {filtered.map((p) => {
            const isSel = !!selected[p.id];
            return (
              <button
                key={p.id}
                onClick={() => toggle(p)}
                className={`w-full flex items-center gap-3 p-3 text-left hover:bg-muted/40 transition-colors ${isSel ? "bg-primary/5" : ""}`}
              >
                <Avatar className="h-9 w-9 border">
                  <AvatarImage src={p.avatarUrl ?? undefined} />
                  <AvatarFallback className="text-xs font-bold bg-primary/10 text-primary">
                    {p.firstName?.charAt(0)}{p.lastName?.charAt(0)}
                  </AvatarFallback>
                </Avatar>
                <span className="flex-1 font-semibold text-sm truncate">{p.fullName}</span>
                <span className={`h-5 w-5 rounded-full border flex items-center justify-center shrink-0 ${isSel ? "bg-primary border-primary text-primary-foreground" : "border-muted-foreground/30"}`}>
                  {isSel && <Check className="h-3.5 w-3.5" />}
                </span>
              </button>
            );
          })}
        </div>

        <div className="p-3 border-t bg-muted/20">
          <Button
            className="w-full rounded-xl font-bold"
            disabled={picked.length === 0 || createChat.isPending}
            onClick={start}
          >
            {picked.length <= 1
              ? "Start chat"
              : `Start group chat (${picked.length})`}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
