import { useState, type FormEvent } from "react";
import { formatDistanceToNow } from "date-fns";
import { Loader2, MessageSquare, RotateCw, Send, SmilePlus, Trash2 } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import {
  getGetClubOverviewQueryKey,
  getGetFeedQueryKey,
  getGetPostQueryKey,
  getListTeamPostsQueryKey,
  useAddComment,
  useDeletePostComment,
  useGetPost,
  useSetPostReaction,
} from "@workspace/api-client-react";
import type { Comment, Post } from "@workspace/api-client-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { apiImageUrl } from "@/lib/team-banner";

const REACTIONS = ["👍", "❤️", "👏", "💪", "😂"] as const;
type ReactionEmoji = (typeof REACTIONS)[number];

type PostLike = Post & { commentCount?: number };

function initials(firstName?: string, lastName?: string) {
  return `${firstName?.[0] ?? ""}${lastName?.[0] ?? ""}` || "·";
}

function patchPosts(queryClient: ReturnType<typeof useQueryClient>, postId: number, teamId: number, change: (post: PostLike) => PostLike) {
  queryClient.setQueryData(getGetFeedQueryKey(), (old: any) =>
    Array.isArray(old) ? old.map((post) => post.id === postId ? change(post) : post) : old,
  );
  queryClient.setQueryData(getGetClubOverviewQueryKey(), (old: any) =>
    old ? { ...old, recentPosts: old.recentPosts?.map((post: PostLike) => post.id === postId ? change(post) : post) } : old,
  );
  queryClient.setQueryData(getListTeamPostsQueryKey(teamId), (old: any) =>
    Array.isArray(old) ? old.map((post) => post.id === postId ? change(post) : post) : old,
  );
}

function refreshRelated(queryClient: ReturnType<typeof useQueryClient>, postId: number, teamId: number) {
  void queryClient.invalidateQueries({ queryKey: getGetFeedQueryKey() });
  void queryClient.invalidateQueries({ queryKey: getGetClubOverviewQueryKey() });
  void queryClient.invalidateQueries({ queryKey: getListTeamPostsQueryKey(teamId) });
  void queryClient.invalidateQueries({ queryKey: getGetPostQueryKey(postId) });
}

export function PostInteractions({ post }: { post: PostLike }) {
  const [expanded, setExpanded] = useState(false);
  const [reactionPickerOpen, setReactionPickerOpen] = useState(false);
  const [lastReaction, setLastReaction] = useState<ReactionEmoji | null>(null);
  const queryClient = useQueryClient();
  const loadComments = expanded || post.commentCount > 0;
  const detail = useGetPost(post.id, {
    query: {
      enabled: loadComments,
      queryKey: getGetPostQueryKey(post.id),
      refetchInterval: loadComments ? 30_000 : false,
      refetchOnWindowFocus: true,
    },
  });

  const setReaction = useSetPostReaction({
    mutation: {
      onSuccess: (updatedPost) => {
        queryClient.setQueryData(getGetPostQueryKey(post.id), (old: any) => old ? { ...old, post: updatedPost } : old);
        patchPosts(queryClient, post.id, post.teamId, () => updatedPost);
        refreshRelated(queryClient, post.id, post.teamId);
      },
      onError: () => {
        refreshRelated(queryClient, post.id, post.teamId);
      },
    },
  });

  const addComment = useAddComment({
    mutation: {
      onSuccess: (comment) => {
        queryClient.setQueryData(getGetPostQueryKey(post.id), (old: any) =>
          old ? { ...old, comments: [...(old.comments ?? []).filter((item: Comment) => item.id !== comment.id), comment], post: { ...old.post, commentCount: (old.post?.commentCount ?? post.commentCount ?? 0) + 1 } } : old,
        );
        patchPosts(queryClient, post.id, post.teamId, (item) => ({ ...item, commentCount: (item.commentCount ?? 0) + 1 }));
        refreshRelated(queryClient, post.id, post.teamId);
      },
    },
  });

  const deleteComment = useDeletePostComment({
    mutation: {
      onSuccess: (_result, variables) => {
        queryClient.setQueryData(getGetPostQueryKey(post.id), (old: any) =>
          old ? { ...old, comments: old.comments?.filter((item: Comment) => item.id !== variables.commentId), post: { ...old.post, commentCount: Math.max(0, (old.post?.commentCount ?? 0) - 1) } } : old,
        );
        patchPosts(queryClient, post.id, post.teamId, (item) => ({ ...item, commentCount: Math.max(0, (item.commentCount ?? 0) - 1) }));
        refreshRelated(queryClient, post.id, post.teamId);
      },
    },
  });

  const currentPost = loadComments && detail.data ? detail.data.post : post;
  const selectedEmoji = currentPost.reactions?.find((reaction) => reaction.reacted)?.emoji;
  const displayedComments = loadComments ? detail.data?.comments ?? [] : [];
  const count = currentPost.commentCount ?? 0;

  return (
    <section className="mt-4 border-t pt-3" aria-label="Post reactions and comments" data-testid={`post-interactions-${post.id}`}>
      <div className="flex flex-wrap items-center gap-1.5">
        <Popover open={reactionPickerOpen} onOpenChange={setReactionPickerOpen}>
          <PopoverTrigger asChild>
            <button
              type="button"
              data-testid={`button-reaction-picker-${post.id}`}
              aria-label={selectedEmoji ? "Change or remove your reaction" : "React to this post"}
              disabled={setReaction.isPending}
              className={`inline-flex h-9 w-9 items-center justify-center rounded-full transition-colors disabled:opacity-60 ${selectedEmoji ? "bg-primary/10 text-primary" : "bg-muted/60 text-muted-foreground hover:bg-muted hover:text-foreground"}`}
            >
              <SmilePlus className="h-4 w-4" />
            </button>
          </PopoverTrigger>
          <PopoverContent align="start" side="top" className="w-auto max-w-[calc(100vw-2rem)] rounded-full p-1.5">
            <div className="flex gap-1" role="group" aria-label="Choose a reaction">
              {REACTIONS.map((emoji) => {
          const reaction = currentPost.reactions?.find((item) => item.emoji === emoji);
          const selected = selectedEmoji === emoji;
          return (
            <button
              type="button"
              key={emoji}
              data-testid={`button-react-${post.id}-${emoji}`}
              aria-label={`${selected ? "Remove" : "Add"} ${emoji} reaction${reaction?.count ? `, ${reaction.count}` : ""}`}
              aria-pressed={selected}
              disabled={setReaction.isPending}
              onClick={() => {
                const nextEmoji = selected ? null : emoji;
                setLastReaction(nextEmoji);
                setReactionPickerOpen(false);
                setReaction.mutate({ postId: post.id, data: { emoji: nextEmoji } });
              }}
              className={`inline-flex h-10 min-w-10 items-center justify-center gap-1 rounded-full px-2 text-lg transition-colors disabled:opacity-60 ${selected ? "bg-primary/10" : "hover:bg-muted"}`}
            >
              <span aria-hidden="true">{emoji}</span>
              {reaction?.count ? <span className="text-xs font-semibold">{reaction.count}</span> : null}
            </button>
          );
              })}
            </div>
          </PopoverContent>
        </Popover>
        {currentPost.reactions?.filter((reaction) => reaction.count > 0).map((reaction) => (
          <span key={reaction.emoji} className="inline-flex items-center gap-1 rounded-full bg-muted/50 px-2 py-1 text-xs" aria-label={`${reaction.count} ${reaction.emoji} reactions`}>
            <span aria-hidden="true">{reaction.emoji}</span>
            <span>{reaction.count}</span>
          </span>
        ))}
        <button
          type="button"
          data-testid={`button-toggle-comments-${post.id}`}
          aria-expanded={expanded}
          aria-label={expanded ? "Close comment editor" : "Add a comment"}
          onClick={() => setExpanded((open) => !open)}
          className="ml-auto inline-flex min-h-9 items-center gap-2 rounded-full px-3 text-sm font-medium text-muted-foreground hover:bg-muted/70 hover:text-foreground"
        >
          <MessageSquare className="h-4 w-4" />
          <span className="text-xs">{expanded ? "Close editor" : "Add a comment"}</span>
        </button>
      </div>
      {setReaction.isError && (
        <div className="mt-2 flex items-center justify-between gap-3 text-xs text-destructive" role="alert">
          <span>Your reaction couldn’t be saved.</span>
          <button
            type="button"
            className="font-semibold underline underline-offset-2"
            data-testid={`button-retry-reaction-${post.id}`}
            onClick={() => setReaction.mutate({ postId: post.id, data: { emoji: lastReaction } })}
          >
            Try again
          </button>
        </div>
      )}

      {loadComments && (
        <div className="mt-3 space-y-2.5" data-testid={`discussion-${post.id}`}>
          {count > 0 && <p className="text-xs text-muted-foreground">{count} {count === 1 ? "comment" : "comments"}</p>}
          {detail.isLoading ? (
            <div className="space-y-3" aria-label="Loading comments">
              {[0, 1].map((item) => <div key={item} className="flex gap-3"><div className="h-8 w-8 animate-pulse rounded-full bg-muted" /><div className="h-10 flex-1 animate-pulse rounded-lg bg-muted" /></div>)}
            </div>
          ) : detail.isError ? (
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-destructive/25 bg-destructive/5 p-3 text-sm">
              <span>Comments couldn’t be loaded.</span>
              <Button type="button" variant="outline" size="sm" onClick={() => void detail.refetch()} data-testid={`button-retry-comments-${post.id}`}>
                <RotateCw className="h-3.5 w-3.5" /> Retry
              </Button>
            </div>
          ) : displayedComments.length === 0 ? (
            <p className="py-1 text-sm text-muted-foreground">No replies yet. Add the first one.</p>
          ) : (
            <div className="space-y-2.5">
              {displayedComments.map((comment) => (
                <CommentRow
                  key={comment.id}
                  comment={comment}
                  deleting={deleteComment.isPending && deleteComment.variables?.commentId === comment.id}
                  onDelete={() => {
                    if (window.confirm("Delete this comment? This can’t be undone.")) {
                      deleteComment.mutate({ postId: post.id, commentId: comment.id });
                    }
                  }}
                />
              ))}
            </div>
          )}
          {deleteComment.isError && <p role="alert" className="text-sm text-destructive">Couldn’t delete that comment. Please try again.</p>}
          {expanded && <CommentForm
            postId={post.id}
            pending={addComment.isPending}
            error={addComment.isError}
            onSubmit={(body) => addComment.mutateAsync({ postId: post.id, data: { body } })}
          />}
        </div>
      )}
    </section>
  );
}

function CommentRow({ comment, deleting, onDelete }: { comment: Comment; deleting: boolean; onDelete: () => void }) {
  return (
    <article className="flex gap-2" data-testid={`comment-${comment.id}`}>
      <Avatar className="h-6 w-6 shrink-0">
        <AvatarImage src={comment.author.avatarUrl ? apiImageUrl(comment.author.avatarUrl) : undefined} />
        <AvatarFallback className="text-[10px]">{initials(comment.author.firstName, comment.author.lastName)}</AvatarFallback>
      </Avatar>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
          <span className="text-xs font-semibold">{comment.author.fullName}</span>
          <time className="text-[10px] text-muted-foreground" dateTime={comment.createdAt}>
            {formatDistanceToNow(new Date(comment.createdAt), { addSuffix: true })}
          </time>
          {comment.canDelete && (
            <button type="button" aria-label="Delete comment" data-testid={`button-delete-comment-${comment.id}`} disabled={deleting} onClick={onDelete} className="ml-auto inline-flex min-h-8 items-center gap-1 rounded-md px-2 text-xs text-muted-foreground hover:bg-background hover:text-destructive disabled:opacity-50">
              {deleting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
              <span className="sr-only sm:not-sr-only">Delete</span>
            </button>
          )}
        </div>
        <p className="mt-0.5 whitespace-pre-wrap break-words text-xs leading-relaxed">{comment.body}</p>
      </div>
    </article>
  );
}

function CommentForm({ postId, pending, error, onSubmit }: { postId: number; pending: boolean; error: boolean; onSubmit: (body: string) => Promise<unknown> }) {
  const [draft, setDraft] = useState("");
  const trimmed = draft.trim();
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!trimmed || trimmed.length > 2000 || pending) return;
    try {
      await onSubmit(trimmed);
      setDraft("");
    } catch {
      // Preserve the draft so the user can retry.
    }
  };

  return (
    <form
      className="border-t pt-3"
      data-testid={`form-comment-${postId}`}
      onSubmit={submit}
    >
      <label htmlFor={`comment-input-${postId}`} className="sr-only">Write a comment</label>
      <div className="flex items-end gap-2">
        <textarea
          id={`comment-input-${postId}`}
          data-testid={`input-comment-${postId}`}
          value={draft}
          onChange={(event) => setDraft(event.target.value.slice(0, 2000))}
          maxLength={2000}
          rows={2}
          placeholder="Write a reply…"
          disabled={pending}
          className="min-h-10 flex-1 resize-y rounded-xl border bg-background px-3 py-2 text-sm outline-none placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60"
        />
        <Button type="submit" size="icon" aria-label="Send comment" data-testid={`button-submit-comment-${postId}`} disabled={!trimmed || pending} className="h-10 w-10 shrink-0 rounded-xl">
          {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
        </Button>
      </div>
      <div className="mt-1 flex justify-between text-[11px] text-muted-foreground">
        {error ? <span role="alert" className="text-destructive">Couldn’t send your reply. Your draft is still here.</span> : <span>Replies are shared with the team.</span>}
        <span className={draft.length >= 1950 ? "text-amber-700" : ""}>{draft.length}/2000</span>
      </div>
    </form>
  );
}
