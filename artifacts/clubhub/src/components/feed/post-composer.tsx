import { useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ImagePlus, Pencil, X } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useGetMe,
  useListTeams,
  useCreatePost,
  useCreateClubPost,
  getGetMeQueryKey,
  getListTeamsQueryKey,
  getGetFeedQueryKey,
  getGetClubOverviewQueryKey,
  getListTeamPostsQueryKey,
} from "@workspace/api-client-react";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { fileToBannerDataUrl } from "@/lib/team-banner";

const MAX_PHOTOS = 6;

/**
 * Heja-style post composer. Renders a "Share something with the team…" card
 * (desktop/inline) or a floating write button (mobile) that opens the same
 * compose dialog. Only visible to users who can post (team staff/club admin).
 */
export function PostComposer({
  variant,
  teamId: fixedTeamId,
}: {
  variant: "card" | "fab" | "button";
  /** Lock the composer to a single team (e.g. on a team page). */
  teamId?: number;
}) {
  const { data: me } = useGetMe({ query: { queryKey: getGetMeQueryKey() } });
  const isClubAdmin = !!me?.isClubAdmin;
  const { data: allTeams } = useListTeams({
    query: { queryKey: getListTeamsQueryKey(), enabled: isClubAdmin },
  });

  const postableTeams = useMemo(() => {
    const teams = isClubAdmin
      ? (allTeams ?? []).map((t) => ({ id: t.id, name: t.name }))
      : (me?.memberships ?? [])
          .filter((m) => m.role === "coach" || m.role === "manager")
          .map((m) => ({ id: m.teamId, name: m.teamName }));
    return fixedTeamId != null ? teams.filter((t) => t.id === fixedTeamId) : teams;
  }, [isClubAdmin, allTeams, me, fixedTeamId]);

  const [open, setOpen] = useState(false);

  if (!me || postableTeams.length === 0) return null;

  const trigger =
    variant === "card" ? (
      <Card className="p-4 rounded-2xl cursor-pointer hover:shadow-md transition-all hidden md:flex items-center gap-3">
        <Avatar className="h-10 w-10 border shadow-sm">
          <AvatarImage src={me.person.avatarUrl ?? undefined} />
          <AvatarFallback>{me.person.firstName?.charAt(0)}</AvatarFallback>
        </Avatar>
        <span className="text-muted-foreground text-sm flex-1">
          Share something with the team…
        </span>
        <Button size="sm" className="rounded-full pointer-events-none" tabIndex={-1}>
          Post
        </Button>
      </Card>
    ) : variant === "button" ? (
      <Button size="sm" className="rounded-xl shadow-sm">
        Post Update
      </Button>
    ) : null;

  // The floating pencil is portalled to <body> and positioned with inline
  // styles so no ancestor (transforms, overflow, stacking contexts) can pull
  // it out of its bottom-right spot above the tab bar.
  const fab =
    variant === "fab"
      ? createPortal(
          <Button
            size="icon"
            aria-label="Write post"
            onClick={() => setOpen(true)}
            className="md:hidden h-14 w-14 rounded-full shadow-lg"
            style={{
              position: "fixed",
              right: "1rem",
              left: "auto",
              bottom: "calc(4.25rem + env(safe-area-inset-bottom))",
              zIndex: 50,
            }}
          >
            <Pencil className="h-6 w-6" />
          </Button>,
          document.body,
        )
      : null;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      {trigger && <DialogTrigger asChild>{trigger}</DialogTrigger>}
      {fab}
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>New post</DialogTitle>
        </DialogHeader>
        <ComposeForm teams={postableTeams} isClubAdmin={isClubAdmin} onDone={() => setOpen(false)} />
      </DialogContent>
    </Dialog>
  );
}

function ComposeForm({
  teams,
  isClubAdmin,
  onDone,
}: {
  teams: { id: number; name: string }[];
  isClubAdmin?: boolean;
  onDone: () => void;
}) {
  const [teamId, setTeamId] = useState<string>(
    teams.length === 1 && !isClubAdmin ? String(teams[0].id) : "",
  );
  const [body, setBody] = useState("");
  const [pinned, setPinned] = useState(false);
  const [photos, setPhotos] = useState<string[]>([]);
  const [processing, setProcessing] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  async function addFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    setProcessing(true);
    try {
      const room = MAX_PHOTOS - photos.length;
      const picked = Array.from(files).slice(0, room);
      const dataUrls = await Promise.all(picked.map(fileToBannerDataUrl));
      setPhotos((prev) => [...prev, ...dataUrls].slice(0, MAX_PHOTOS));
      if (files.length > room)
        toast({ title: `Up to ${MAX_PHOTOS} photos per post` });
    } catch {
      toast({
        title: "Couldn't add photo",
        description: "That image couldn't be processed — try another one.",
        variant: "destructive",
      });
    } finally {
      setProcessing(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  const createPost = useCreatePost({
    mutation: {
      onSuccess: (_post, vars) => {
        queryClient.invalidateQueries({ queryKey: getGetFeedQueryKey() });
        queryClient.invalidateQueries({ queryKey: getGetClubOverviewQueryKey() });
        queryClient.invalidateQueries({
          queryKey: getListTeamPostsQueryKey(vars.teamId),
        });
        toast({ title: "Posted", description: "Your update is live on the team feed." });
        onDone();
      },
      onError: () => {
        toast({
          title: "Couldn't post",
          description: "Something went wrong — please try again.",
          variant: "destructive",
        });
      },
    },
  });

  const createClubPost = useCreateClubPost({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getGetFeedQueryKey() });
        queryClient.invalidateQueries({ queryKey: getGetClubOverviewQueryKey() });
        toast({ title: "Posted", description: "Your update is live on every team's feed." });
        onDone();
      },
      onError: () => {
        toast({
          title: "Couldn't post",
          description: "Something went wrong — please try again.",
          variant: "destructive",
        });
      },
    },
  });

  const pending = createPost.isPending || createClubPost.isPending;
  const canSubmit =
    body.trim().length > 0 && teamId !== "" && !pending && !processing;

  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        if (!canSubmit) return;
        const data = {
          body: body.trim(),
          pinned,
          ...(photos.length > 0 ? { photos } : {}),
        };
        if (teamId === "all") createClubPost.mutate({ data });
        else createPost.mutate({ teamId: Number(teamId), data });
      }}
    >
      {teams.length > 1 || isClubAdmin ? (
        <div className="space-y-2">
          <Label>Team</Label>
          <Select value={teamId} onValueChange={setTeamId}>
            <SelectTrigger>
              <SelectValue placeholder="Choose a team" />
            </SelectTrigger>
            <SelectContent>
              {isClubAdmin && (
                <SelectItem value="all">All teams (whole club)</SelectItem>
              )}
              {teams.map((t) => (
                <SelectItem key={t.id} value={String(t.id)}>
                  {t.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">
          Posting to <span className="font-semibold text-foreground">{teams[0].name}</span>
        </p>
      )}

      <div className="space-y-2">
        <Label htmlFor="post-body">Message</Label>
        <Textarea
          id="post-body"
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder="Share something with the team…"
          rows={6}
          autoFocus={teams.length === 1}
        />
      </div>

      {photos.length > 0 && (
        <div className="grid grid-cols-3 gap-2">
          {photos.map((src, i) => (
            <div key={i} className="relative aspect-square overflow-hidden rounded-lg border">
              <img src={src} alt={`Photo ${i + 1}`} className="h-full w-full object-cover" />
              <button
                type="button"
                aria-label="Remove photo"
                className="absolute top-1 right-1 rounded-full bg-black/60 p-1 text-white hover:bg-black/80"
                onClick={() => setPhotos((prev) => prev.filter((_, j) => j !== i))}
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}

      <input
        ref={fileInputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        multiple
        className="hidden"
        onChange={(e) => addFiles(e.target.files)}
      />

      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label="Add photos"
            title="Add photos"
            className="h-9 w-9 text-muted-foreground"
            disabled={processing || photos.length >= MAX_PHOTOS}
            onClick={() => fileInputRef.current?.click()}
          >
            <ImagePlus className="h-5 w-5" />
          </Button>
          <div className="flex items-center gap-2">
            <Switch id="post-pinned" checked={pinned} onCheckedChange={setPinned} />
            <Label htmlFor="post-pinned" className="cursor-pointer">
              Pin to top
            </Label>
          </div>
        </div>
        <Button type="submit" disabled={!canSubmit} className="rounded-full px-6">
          {pending ? "Posting…" : processing ? "Adding photo…" : "Post"}
        </Button>
      </div>
    </form>
  );
}
