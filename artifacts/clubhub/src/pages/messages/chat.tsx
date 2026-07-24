import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useParams } from "wouter";
import { format, isToday, isYesterday, isSameDay } from "date-fns";
import { ArrowLeft, Hash, Send, Users, CheckCheck } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useGetChat,
  useListMessages,
  useSendMessage,
  useMarkChatRead,
  useGetMe,
  getGetChatQueryKey,
  getListMessagesQueryKey,
  getListChatsQueryKey,
  getGetMeQueryKey,
  getListTeamUnreadsQueryKey,
} from "@workspace/api-client-react";

import { LoadingScreen, ErrorState } from "@/components/ui/states";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Textarea } from "@/components/ui/textarea";

export default function ChatPage() {
  const params = useParams();
  const chatId = Number(params.chatId);
  const queryClient = useQueryClient();

  const { data: me } = useGetMe({ query: { queryKey: getGetMeQueryKey() } });
  const myId = me?.person?.id;

  const { data: detail, isLoading: detailLoading, error: detailError, refetch: refetchDetail } =
    useGetChat(chatId, {
      query: {
        queryKey: getGetChatQueryKey(chatId),
        // Reads move as other members open the chat — keep receipts fresh.
        refetchInterval: 10_000,
      },
    });

  const { data: messages, isLoading: messagesLoading, error: messagesError, refetch: refetchMessages } =
    useListMessages(chatId, {
      query: {
        queryKey: getListMessagesQueryKey(chatId),
        refetchInterval: 5_000,
        refetchOnWindowFocus: true,
      },
    });

  const sendMessage = useSendMessage({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListMessagesQueryKey(chatId) });
        queryClient.invalidateQueries({ queryKey: getListChatsQueryKey() });
      },
    },
  });

  const markRead = useMarkChatRead({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListChatsQueryKey() });
        queryClient.invalidateQueries({ queryKey: getListTeamUnreadsQueryKey() });
      },
    },
  });
  const markReadMutate = markRead.mutate;

  // Mark the chat read when viewing it, and again as new messages arrive.
  const lastMessageId = messages?.length ? messages[messages.length - 1].id : null;
  useEffect(() => {
    if (!chatId || lastMessageId == null) return;
    const t = setTimeout(() => markReadMutate({ chatId }), 800);
    return () => clearTimeout(t);
  }, [chatId, lastMessageId, markReadMutate]);

  // Auto-scroll to the newest message.
  const bottomRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: "end" });
  }, [lastMessageId]);

  const [draft, setDraft] = useState("");
  const send = () => {
    const body = draft.trim();
    if (!body || sendMessage.isPending) return;
    sendMessage.mutate({ chatId, data: { body } });
    setDraft("");
  };

  // "Seen by N" — how many OTHER members have read up to a given message.
  const seenCountFor = useMemo(() => {
    const reads = detail?.reads ?? [];
    return (createdAt: string) =>
      reads.filter(
        (r) =>
          r.userId !== myId &&
          r.lastReadAt != null &&
          new Date(r.lastReadAt) >= new Date(createdAt),
      ).length;
  }, [detail?.reads, myId]);
  const otherMemberCount = Math.max((detail?.members?.length ?? 1) - 1, 0);

  if (detailLoading || messagesLoading) return <LoadingScreen message="Loading chat..." />;
  if (detailError || messagesError || !detail || !messages)
    return <ErrorState onRetry={() => { refetchDetail(); refetchMessages(); }} />;

  const chat = detail.chat;
  const isTeam = chat.type === "team";


  return (
    <div className="flex-1 flex flex-col min-h-0 bg-muted/10">
      {/* Chat header */}
      <div className="bg-background border-b px-4 py-3 flex items-center gap-3 shrink-0">
        <Button asChild variant="ghost" size="icon" className="shrink-0 -ml-2">
          <Link href="/messages"><ArrowLeft className="h-5 w-5" /></Link>
        </Button>
        {isTeam ? (
          <div className="h-10 w-10 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center shrink-0">
            <Hash className="h-5 w-5 text-primary" />
          </div>
        ) : (
          <Avatar className="h-10 w-10 border shrink-0">
            <AvatarFallback className="bg-muted font-bold text-sm">
              {chat.name.substring(0, 2).toUpperCase()}
            </AvatarFallback>
          </Avatar>
        )}
        <div className="min-w-0">
          <h1 className="font-bold text-base truncate leading-tight">{chat.name}</h1>
          <p className="text-xs text-muted-foreground flex items-center gap-1">
            <Users className="h-3 w-3" /> {detail.members.length} members
          </p>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-4">
        <div className="max-w-2xl mx-auto space-y-1">
          {messages.length === 0 && (
            <p className="text-center text-sm text-muted-foreground py-12">
              No messages yet — say hello!
            </p>
          )}
          {messages.map((m, i) => {
            const own = m.author.id === myId;
            const prev = i > 0 ? messages[i - 1] : null;
            const newDay = !prev || !isSameDay(new Date(prev.createdAt), new Date(m.createdAt));
            const sameAuthorAsPrev = !newDay && prev?.author.id === m.author.id;
            // Every message shows how many of the other members have seen it.
            const seen = seenCountFor(m.createdAt);
            return (
              <div key={m.id}>
                {newDay && (
                  <div className="text-center text-[11px] font-semibold text-muted-foreground py-3">
                    {dayLabel(new Date(m.createdAt))}
                  </div>
                )}
                <div className={`flex gap-2 ${own ? "justify-end" : "justify-start"} ${sameAuthorAsPrev ? "mt-0.5" : "mt-3"}`}>
                  {!own && (
                    <div className="w-8 shrink-0 self-end">
                      {!sameAuthorAsPrev && (
                        <Avatar className="h-8 w-8 border">
                          <AvatarImage src={m.author.avatarUrl ?? undefined} />
                          <AvatarFallback className="text-[10px] font-bold bg-primary/10 text-primary">
                            {m.author.firstName?.charAt(0)}{m.author.lastName?.charAt(0)}
                          </AvatarFallback>
                        </Avatar>
                      )}
                    </div>
                  )}
                  <div className={`max-w-[75%] ${own ? "items-end" : "items-start"} flex flex-col`}>
                    {!own && !sameAuthorAsPrev && (
                      <span className="text-[11px] font-semibold text-muted-foreground px-2 mb-0.5">
                        {m.author.firstName} {m.author.lastName}
                      </span>
                    )}
                    <div
                      className={`px-3.5 py-2 text-sm whitespace-pre-line break-words rounded-2xl ${
                        own
                          ? "bg-primary text-primary-foreground rounded-br-md"
                          : "bg-background border rounded-bl-md"
                      }`}
                    >
                      {m.body}
                    </div>
                    <span className="text-[10px] text-muted-foreground px-1.5 mt-0.5 flex items-center gap-1">
                      {format(new Date(m.createdAt), "h:mm a")}
                      {otherMemberCount > 0 && (
                        <span className="flex items-center gap-0.5 font-medium">
                          <CheckCheck className={`h-3 w-3 ${seen >= otherMemberCount ? "text-primary" : ""}`} />
                          {own && seen === 0
                            ? "Sent"
                            : `${Math.min(seen, otherMemberCount)}/${otherMemberCount}`}
                        </span>
                      )}
                    </span>
                  </div>
                </div>
              </div>
            );
          })}
          <div ref={bottomRef} />
        </div>
      </div>

      {/* Composer */}
      <div className="bg-background border-t p-3 shrink-0">
        <div className="max-w-2xl mx-auto flex items-end gap-2">
          <Textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              // Enter sends on desktop only; on touch devices Enter makes a
              // newline and the send button is the way to send.
              const isTouch = window.matchMedia("(pointer: coarse)").matches;
              if (e.key === "Enter" && !e.shiftKey && !isTouch) {
                e.preventDefault();
                send();
              }
            }}
            placeholder="Write a message..."
            rows={1}
            className="resize-none min-h-[44px] max-h-32 rounded-2xl"
          />
          <Button
            size="icon"
            className="h-11 w-11 rounded-full shrink-0"
            onClick={send}
            disabled={!draft.trim() || sendMessage.isPending}
          >
            <Send className="h-5 w-5" />
          </Button>
        </div>
      </div>
    </div>
  );
}

function dayLabel(d: Date) {
  if (isToday(d)) return "Today";
  if (isYesterday(d)) return "Yesterday";
  return format(d, "EEEE, MMM d");
}
