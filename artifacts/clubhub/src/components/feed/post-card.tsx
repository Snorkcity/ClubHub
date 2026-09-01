import { useState } from "react";
import { Link } from "wouter";
import { format } from "date-fns";
import { MessageSquare, Pin, PinOff } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useGetMe,
  useUpdatePost,
  getGetMeQueryKey,
  getGetFeedQueryKey,
  getGetClubOverviewQueryKey,
  getListTeamPostsQueryKey,
} from "@workspace/api-client-react";

import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useToast } from "@/hooks/use-toast";
import { apiImageUrl } from "@/lib/team-banner";
import { PhotoLightbox } from "@/components/feed/photo-lightbox";

/** Photo attachments: single photo full-width, several in a tight grid. Tap to view full-screen. */
function PhotoGrid({ photos }: { photos: { id: number; url: string }[] }) {
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);

  if (photos.length === 0) return null;

  const openAt = (i: number) => (e: React.MouseEvent) => {
    // Cards can be wrapped in a Link; don't navigate when opening a photo.
    e.preventDefault();
    e.stopPropagation();
    setLightboxIndex(i);
  };

  const lightbox = lightboxIndex !== null && (
    <PhotoLightbox
      photos={photos}
      initialIndex={lightboxIndex}
      onClose={() => setLightboxIndex(null)}
    />
  );

  if (photos.length === 1) {
    return (
      <>
        <img
          src={apiImageUrl(photos[0].url)}
          alt="Post photo"
          loading="lazy"
          className="mt-3 w-full max-h-96 rounded-xl border object-cover cursor-pointer"
          onClick={openAt(0)}
        />
        {lightbox}
      </>
    );
  }
  return (
    <>
      <div className={"mt-3 grid gap-1.5 " + (photos.length === 2 ? "grid-cols-2" : "grid-cols-3")}>
        {photos.map((p, i) => (
          <img
            key={p.id}
            src={apiImageUrl(p.url)}
            alt={`Post photo ${i + 1}`}
            loading="lazy"
            className="aspect-square w-full rounded-lg border object-cover cursor-pointer"
            onClick={openAt(i)}
          />
        ))}
      </div>
      {lightbox}
    </>
  );
}

export function PostCard({ post, linkToTeam = true }: { post: any; linkToTeam?: boolean }) {
  const [expanded, setExpanded] = useState(false);
  // Rough check for whether the body is long enough to need a "Read more".
  const isLong = post.body.length > 400 || post.body.split("\n").length > 8;
  const card = (
    <Card
      className={
        "p-5 rounded-2xl" +
        (linkToTeam ? " hover:shadow-md transition-all cursor-pointer" : "")
      }
    >
      <div className="flex items-start gap-3 mb-3">
        <Avatar className="h-10 w-10 border shadow-sm">
          <AvatarImage src={post.author.avatarUrl} />
          <AvatarFallback>{post.author.firstName?.charAt(0)}</AvatarFallback>
        </Avatar>
        <div className="flex flex-col">
          <span className="font-semibold text-sm">{post.author.fullName}</span>
          <div className="flex items-center text-xs text-muted-foreground">
            <span>{post.teamName}</span>
            <span className="mx-1.5">•</span>
            <span>{format(new Date(post.createdAt), "MMM d")}</span>
          </div>
        </div>
        <div className="ml-auto flex items-center gap-1.5">
          {post.pinned && (
            <Badge variant="secondary" className="text-[10px] bg-amber-100 text-amber-800 hover:bg-amber-100">PINNED</Badge>
          )}
          <PinToggle post={post} />
        </div>
      </div>

      <p
        className={
          "text-sm text-foreground/90 leading-relaxed whitespace-pre-line" +
          (isLong && !expanded ? " line-clamp-[8]" : "")
        }
      >
        {post.body}
      </p>
      {isLong && (
        <button
          type="button"
          className="mt-1.5 text-sm font-medium text-primary hover:underline"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            setExpanded((v) => !v);
          }}
        >
          {expanded ? "Show less" : "Read more"}
        </button>
      )}

      <PhotoGrid photos={post.photos ?? []} />

      {post.commentCount > 0 && (
        <div className="mt-4 flex items-center text-xs font-medium text-muted-foreground">
          <MessageSquare className="h-4 w-4 mr-1.5" />
          {post.commentCount} {post.commentCount === 1 ? "comment" : "comments"}
        </div>
      )}
    </Card>
  );

  if (!linkToTeam) return card;
  return <Link href={`/teams/${post.teamId}#post-${post.id}`}>{card}</Link>;
}

/** Staff-only pin/unpin toggle. Re-pinning restarts the 2-day pin window. */
function PinToggle({ post }: { post: any }) {
  const { data: me } = useGetMe({ query: { queryKey: getGetMeQueryKey() } });
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const updatePost = useUpdatePost({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getGetFeedQueryKey() });
        queryClient.invalidateQueries({ queryKey: getGetClubOverviewQueryKey() });
        queryClient.invalidateQueries({
          queryKey: getListTeamPostsQueryKey(post.teamId),
        });
      },
      onError: () => {
        toast({
          title: "Couldn't update pin",
          description: "Please try again.",
          variant: "destructive",
        });
      },
    },
  });

  const isStaff =
    !!me &&
    (me.isClubAdmin ||
      (me.memberships ?? []).some(
        (m) =>
          m.teamId === post.teamId && (m.role === "coach" || m.role === "manager"),
      ));
  if (!isStaff) return null;

  return (
    <Button
      variant="ghost"
      size="icon"
      className="h-8 w-8 text-muted-foreground"
      aria-label={post.pinned ? "Unpin post" : "Pin post"}
      title={post.pinned ? "Unpin" : "Pin for 2 days"}
      disabled={updatePost.isPending}
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        updatePost.mutate({ postId: post.id, data: { pinned: !post.pinned } });
      }}
    >
      {post.pinned ? <PinOff className="h-4 w-4" /> : <Pin className="h-4 w-4" />}
    </Button>
  );
}
